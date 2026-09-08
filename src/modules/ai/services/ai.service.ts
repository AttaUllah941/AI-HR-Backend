import type { AiFeature, Prisma } from '@prisma/client';
import { env } from '../../../config/env.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../utils/app-error.js';
import { createAiProvider } from '../providers/create-ai-provider.js';
import type { AiChatMessage, AiProvider } from '../providers/ai-provider.js';
import { AiRepository } from '../repositories/ai.repository.js';
import { parsePagination, paginationMeta } from '../../../utils/pagination.js';
import type {
  AppraisalInput,
  AssistantChatInput,
  InsightsInput,
  PolicyGenerateInput,
  RecommendationsInput,
  ResumeScreeningInput,
} from '../validators/ai.validators.js';

type AuthActor = { id: string; permissions: string[] };

/** Safe JSON parse — returns parsed object or `{ text: content }`. */
export function safeParseJson(content: string): Prisma.InputJsonValue {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as Prisma.InputJsonValue;
  } catch {
    return { text: content };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function extractScore(output: Prisma.InputJsonValue): number | null {
  const obj = asRecord(output);
  if (!obj) return null;
  const score = obj.score;
  if (typeof score === 'number' && Number.isFinite(score)) {
    return Math.min(100, Math.max(0, score));
  }
  return null;
}

function extractScreeningNotes(output: Prisma.InputJsonValue): string | null {
  const obj = asRecord(output);
  if (!obj) return null;
  if (typeof obj.summary === 'string') return obj.summary.slice(0, 2000);
  if (typeof obj.text === 'string') return obj.text.slice(0, 2000);
  return null;
}

const AI_FEATURES = [
  'RESUME_SCREENING',
  'APPRAISAL',
  'HR_ASSISTANT',
  'POLICY',
  'INSIGHTS',
  'RECOMMENDATIONS',
] as const;

/** Generations safe for view-only roles (no screening/appraisal/policy drafts). */
const PUBLIC_FEATURES: AiFeature[] = ['INSIGHTS', 'RECOMMENDATIONS'];

export class AiService {
  constructor(
    private readonly repo = new AiRepository(),
    private readonly provider: AiProvider = createAiProvider(),
  ) {}

  private async requireCompanyId(userId: string): Promise<string> {
    const user = await this.repo.findUserCompanyId(userId);
    if (!user?.companyId) {
      throw new ForbiddenError('Your account is not linked to a company');
    }
    return user.companyId;
  }

  /** HR/ops roles with create can see all company AI artifacts; view-only is scoped. */
  private canManageAi(actor: AuthActor): boolean {
    return actor.permissions.includes('ai:create') || actor.permissions.includes('ai:delete');
  }

  private generationScope(actor: AuthActor): {
    userId?: string;
    featureIn?: AiFeature[];
  } {
    if (this.canManageAi(actor)) {
      return {};
    }
    return { featureIn: PUBLIC_FEATURES };
  }

  /**
   * Run provider completion with timing + usage log.
   * Never exposes API keys. Logs SUCCESS or FAILED.
   */
  private async completeLogged(
    companyId: string,
    userId: string,
    feature: AiFeature,
    messages: AiChatMessage[],
    metadata?: Prisma.InputJsonValue,
  ) {
    const started = Date.now();
    try {
      const result = await this.provider.complete({ messages });
      const latencyMs = Date.now() - started;
      await this.repo.createUsageLog({
        companyId,
        userId,
        feature,
        provider: this.provider.name,
        model: result.model ?? env.AI_MODEL,
        status: 'SUCCESS',
        promptTokens: result.usage?.promptTokens ?? null,
        completionTokens: result.usage?.completionTokens ?? null,
        latencyMs,
        metadata,
      });
      return result;
    } catch (error) {
      const latencyMs = Date.now() - started;
      const message = error instanceof Error ? error.message : 'AI request failed';
      await this.repo.createUsageLog({
        companyId,
        userId,
        feature,
        provider: this.provider.name,
        model: env.AI_MODEL,
        status: 'FAILED',
        latencyMs,
        errorMessage: message.slice(0, 1000),
        metadata,
      });
      throw error;
    }
  }

  getStatus() {
    const effective =
      env.AI_PROVIDER === 'openai' && env.AI_API_KEY ? 'openai' : 'mock';
    return {
      provider: effective,
      model: effective === 'openai' ? env.AI_MODEL : 'mock-nova-1',
      features: [...AI_FEATURES],
    };
  }

  async getSummary(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    const scope = this.generationScope(actor);
    const [byFeature, byStatus, recent, conversations, generations] = await Promise.all([
      this.repo.usageCountsByFeature(companyId),
      this.repo.usageStatusCounts(companyId),
      this.repo.recentGenerations(companyId, 10, scope),
      this.repo.countConversations(
        companyId,
        this.canManageAi(actor) ? undefined : actor.id,
      ),
      this.repo.countGenerations(companyId, scope),
    ]);

    const usageByFeature: Record<string, number> = {};
    for (const row of byFeature) {
      usageByFeature[row.feature] = row._count._all;
    }
    const usageByStatus: Record<string, number> = {};
    for (const row of byStatus) {
      usageByStatus[row.status] = row._count._all;
    }

    const successCount = usageByStatus.SUCCESS ?? 0;
    const failedCount = usageByStatus.FAILED ?? 0;
    const pendingCount = usageByStatus.PENDING ?? 0;
    const totalRequests = successCount + failedCount + pendingCount;

    const recentInsightsGen = recent.find((g) => g.feature === 'INSIGHTS');
    const recentInsights = recentInsightsGen?.output ?? null;

    return {
      totalRequests,
      successCount,
      failedCount,
      conversations,
      generations,
      usageByFeature,
      usageByStatus,
      recentInsights,
      recentGenerations: recent.map(({ output: _output, ...rest }) => rest),
      provider: this.getStatus(),
    };
  }

  // —— Assistant chat ——

  async assistantChat(actor: AuthActor, input: AssistantChatInput) {
    const companyId = await this.requireCompanyId(actor.id);

    let conversationId = input.conversationId ?? null;

    if (conversationId) {
      const existing = await this.repo.findConversation(companyId, conversationId, actor.id);
      if (!existing) {
        throw new NotFoundError('Conversation not found');
      }
    } else {
      const title =
        input.title?.trim() ||
        input.message.trim().slice(0, 80) ||
        'HR Assistant chat';
      const created = await this.repo.createConversation({
        companyId,
        userId: actor.id,
        title,
      });
      conversationId = created.id;
    }

    const history = await this.repo.listMessages(conversationId);
    const userContent = input.message.trim();
    const messages: AiChatMessage[] = [
      {
        role: 'system',
        content:
          'You are Nova, the Zenith HR assistant. Help with leave, attendance, payroll, recruitment, and performance. Be concise and actionable. Do not invent confidential employee data.',
      },
      ...history.map((m) => ({
        role: (m.role === 'USER'
          ? 'user'
          : m.role === 'ASSISTANT'
            ? 'assistant'
            : 'system') as AiChatMessage['role'],
        content: m.content,
      })),
      { role: 'user', content: userContent },
    ];

    const result = await this.completeLogged(
      companyId,
      actor.id,
      'HR_ASSISTANT',
      messages,
      { conversationId },
    );

    await this.repo.createMessage({
      conversationId,
      role: 'USER',
      content: userContent,
    });
    await this.repo.createMessage({
      conversationId,
      role: 'ASSISTANT',
      content: result.content,
    });

    await this.repo.touchConversation(conversationId);

    const updated = await this.repo.findConversation(companyId, conversationId, actor.id);
    if (!updated) throw new NotFoundError('Conversation not found');
    return updated;
  }

  async listConversations(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePagination(params);
    const [items, total] = await this.repo.listConversations(companyId, actor.id, {
      page,
      pageSize,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async getConversation(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const conversation = await this.repo.findConversation(companyId, id, actor.id);
    if (!conversation) throw new NotFoundError('Conversation not found');
    return conversation;
  }

  async deleteConversation(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const conversation = await this.repo.findConversation(companyId, id, actor.id);
    if (!conversation) throw new NotFoundError('Conversation not found');
    await this.repo.softDeleteConversation(id);
    return { id, deleted: true };
  }

  // —— Resume screening ——

  async screenResume(actor: AuthActor, input: ResumeScreeningInput) {
    const companyId = await this.requireCompanyId(actor.id);
    if (
      !actor.permissions.includes('recruitment:view') &&
      !actor.permissions.includes('recruitment:update')
    ) {
      throw new ForbiddenError('Recruitment access is required for resume screening');
    }

    const candidate = await this.repo.findCandidate(companyId, input.candidateId);
    if (!candidate) throw new NotFoundError('Candidate not found');

    let job: Awaited<ReturnType<AiRepository['findJobOpening']>> = null;
    if (input.jobOpeningId) {
      job = await this.repo.findJobOpening(companyId, input.jobOpeningId);
      if (!job) throw new ValidationError('Invalid job opening');
    }

    const system = [
      'You are an expert recruiter performing resume screening.',
      'Return ONLY valid JSON with keys: score (0-100 number), recommendation (string), strengths (string[]), gaps (string[]), summary (string).',
      'Be fair and evidence-based. Do not invent credentials not present in the candidate profile.',
      'When resume file text is unavailable, score from profile fields and clearly note limited evidence.',
    ].join(' ');

    const userPayload = {
      candidate: {
        ...candidate,
        resumeTextAvailable: false,
        resumeNote:
          'Binary resume content is not ingested yet; screen from structured candidate/job fields only.',
      },
      jobOpening: job,
      notes: input.notes ?? null,
    };

    const result = await this.completeLogged(
      companyId,
      actor.id,
      'RESUME_SCREENING',
      [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      { candidateId: candidate.id, jobOpeningId: job?.id ?? null },
    );

    const output = safeParseJson(result.content);
    const score = extractScore(output);
    const notes = extractScreeningNotes(output);

    if (score !== null) {
      if (
        actor.permissions.includes('recruitment:update') ||
        actor.permissions.includes('recruitment:approve')
      ) {
        await this.repo.updateCandidateScreening(candidate.id, {
          screeningScore: score,
          screeningNotes: notes,
        });
      }
    }

    const candidateUpdated =
      score !== null &&
      (actor.permissions.includes('recruitment:update') ||
        actor.permissions.includes('recruitment:approve'));

    const generation = await this.repo.createGeneration({
      companyId,
      userId: actor.id,
      feature: 'RESUME_SCREENING',
      status: 'SUCCESS',
      input: userPayload as unknown as Prisma.InputJsonValue,
      output,
      relatedEntityType: 'Candidate',
      relatedEntityId: candidate.id,
      provider: this.provider.name,
      model: result.model ?? null,
    });

    return {
      generation,
      screening: output,
      candidateUpdated,
      screeningScore: score,
    };
  }

  // —— Appraisal ——

  async generateAppraisal(actor: AuthActor, input: AppraisalInput) {
    const companyId = await this.requireCompanyId(actor.id);
    if (!actor.permissions.includes('performance:view')) {
      throw new ForbiddenError('Performance access is required for appraisal generation');
    }

    const employee = await this.repo.findEmployee(companyId, input.employeeId);
    if (!employee) throw new NotFoundError('Employee not found');

    let review: Awaited<ReturnType<AiRepository['findPerformanceReview']>> = null;
    if (input.reviewId) {
      review = await this.repo.findPerformanceReview(companyId, input.reviewId);
      if (!review) throw new ValidationError('Invalid performance review');
      if (review.employeeId !== employee.id) {
        throw new ValidationError('Review does not belong to this employee');
      }
    }

    const [goals, kpis] = await Promise.all([
      this.repo.findEmployeeGoals(companyId, employee.id),
      this.repo.findEmployeeKpis(companyId, employee.id),
    ]);

    const system = [
      'You are an HR performance specialist writing an appraisal draft.',
      'Return ONLY valid JSON with keys: overallRating (number 1-5), narrative (string), strengths (string[]), developmentAreas (string[]), recommendedGoals (string[]).',
      'Base the draft on the provided goals, KPIs, and review data. Do not invent private facts.',
    ].join(' ');

    const userPayload = {
      employee,
      periodLabel: input.periodLabel ?? null,
      goals,
      kpis,
      review,
    };

    const result = await this.completeLogged(
      companyId,
      actor.id,
      'APPRAISAL',
      [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      { employeeId: employee.id, reviewId: review?.id ?? null },
    );

    const output = safeParseJson(result.content);
    const generation = await this.repo.createGeneration({
      companyId,
      userId: actor.id,
      feature: 'APPRAISAL',
      status: 'SUCCESS',
      input: userPayload as unknown as Prisma.InputJsonValue,
      output,
      relatedEntityType: 'Employee',
      relatedEntityId: employee.id,
      provider: this.provider.name,
      model: result.model ?? null,
    });

    return { generation, appraisal: output };
  }

  // —— Policy ——

  async generatePolicy(actor: AuthActor, input: PolicyGenerateInput) {
    const companyId = await this.requireCompanyId(actor.id);

    const system = [
      'You are an HR policy writer for Zenith Enterprises.',
      'Write a clear markdown policy document with Purpose, Scope, Policy statements, Compliance, and Review sections.',
      'Tone must match the requested tone. Do not include legal disclaimers as if they were attorney advice.',
    ].join(' ');

    const userPayload = {
      topic: input.topic,
      audience: input.audience ?? 'all employees',
      tone: input.tone ?? 'formal',
      additionalContext: input.additionalContext ?? null,
    };

    const result = await this.completeLogged(
      companyId,
      actor.id,
      'POLICY',
      [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            `Topic: ${userPayload.topic}`,
            `Audience: ${userPayload.audience}`,
            `Tone: ${userPayload.tone}`,
            userPayload.additionalContext
              ? `Additional context: ${userPayload.additionalContext}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
      { topic: input.topic },
    );

    const output = { markdown: result.content };
    const generation = await this.repo.createGeneration({
      companyId,
      userId: actor.id,
      feature: 'POLICY',
      status: 'SUCCESS',
      input: userPayload as unknown as Prisma.InputJsonValue,
      output,
      relatedEntityType: 'Policy',
      relatedEntityId: null,
      provider: this.provider.name,
      model: result.model ?? null,
    });

    return { generation, policy: output };
  }

  // —— Insights ——

  async getInsights(actor: AuthActor, _input?: InsightsInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const [latest, counts] = await Promise.all([
      this.repo.findLatestGeneration(companyId, 'INSIGHTS'),
      this.repo.companyInsightCounts(companyId),
    ]);

    return {
      counts,
      generation: latest,
      insights: latest?.output ?? null,
    };
  }

  async refreshInsights(actor: AuthActor, input: InsightsInput = {}) {
    const companyId = await this.requireCompanyId(actor.id);
    const counts = await this.repo.companyInsightCounts(companyId);

    const system = [
      'You are a workforce analytics advisor producing HR insights.',
      'Return ONLY valid JSON: { "insights": [ { "title": string, "detail": string, "severity": "info"|"warning"|"critical" } ] }.',
      'Use the company stats provided. Focus area may be specified.',
    ].join(' ');

    const userPayload = {
      focus: input.focus ?? 'workforce',
      counts,
    };

    const result = await this.completeLogged(
      companyId,
      actor.id,
      'INSIGHTS',
      [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      { focus: input.focus ?? 'workforce' },
    );

    const parsed = safeParseJson(result.content);
    const output = asRecord(parsed)?.insights
      ? parsed
      : { insights: [{ title: 'Summary', detail: result.content, severity: 'info' }] };

    const generation = await this.repo.createGeneration({
      companyId,
      userId: actor.id,
      feature: 'INSIGHTS',
      status: 'SUCCESS',
      input: userPayload as unknown as Prisma.InputJsonValue,
      output,
      relatedEntityType: 'Company',
      relatedEntityId: companyId,
      provider: this.provider.name,
      model: result.model ?? null,
    });

    return { counts, generation, insights: output };
  }

  // —— Recommendations ——

  async getRecommendations(actor: AuthActor, _input?: RecommendationsInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const [latest, counts] = await Promise.all([
      this.repo.findLatestGeneration(companyId, 'RECOMMENDATIONS'),
      this.repo.companyInsightCounts(companyId),
    ]);

    return {
      counts,
      generation: latest,
      recommendations: latest?.output ?? null,
    };
  }

  async refreshRecommendations(actor: AuthActor, input: RecommendationsInput = {}) {
    const companyId = await this.requireCompanyId(actor.id);
    const counts = await this.repo.companyInsightCounts(companyId);
    const limit = input.limit ?? 5;

    const system = [
      'You are an HR operations advisor producing actionable recommendations.',
      `Return ONLY valid JSON: { "recommendations": [ { "area": string, "action": string, "impact": "high"|"medium"|"low" } ] } with at most ${limit} items.`,
    ].join(' ');

    const userPayload = { limit, counts };

    const result = await this.completeLogged(
      companyId,
      actor.id,
      'RECOMMENDATIONS',
      [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      { limit },
    );

    const parsed = safeParseJson(result.content);
    const output = asRecord(parsed)?.recommendations
      ? parsed
      : {
          recommendations: [
            { area: 'General', action: result.content, impact: 'medium' },
          ],
        };

    const generation = await this.repo.createGeneration({
      companyId,
      userId: actor.id,
      feature: 'RECOMMENDATIONS',
      status: 'SUCCESS',
      input: userPayload as unknown as Prisma.InputJsonValue,
      output,
      relatedEntityType: 'Company',
      relatedEntityId: companyId,
      provider: this.provider.name,
      model: result.model ?? null,
    });

    return { counts, generation, recommendations: output };
  }

  // —— Generations CRUD ——

  async listGenerations(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePagination(params);
    const feature = params.feature as AiFeature | undefined;
    const allowed: AiFeature[] = [
      'RESUME_SCREENING',
      'APPRAISAL',
      'HR_ASSISTANT',
      'POLICY',
      'INSIGHTS',
      'RECOMMENDATIONS',
    ];
    if (feature && !allowed.includes(feature)) {
      throw new ValidationError('Invalid feature filter');
    }

    const scope = this.generationScope(actor);
    if (feature && scope.featureIn && !scope.featureIn.includes(feature)) {
      throw new ForbiddenError('You do not have access to this AI feature history');
    }

    const [items, total] = await this.repo.listGenerations(companyId, {
      page,
      pageSize,
      feature,
      featureIn: feature ? undefined : scope.featureIn,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async getGeneration(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const scope = this.generationScope(actor);
    const generation = await this.repo.findGeneration(companyId, id, {
      featureIn: scope.featureIn,
    });
    if (!generation) throw new NotFoundError('Generation not found');
    return generation;
  }

  async deleteGeneration(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const generation = await this.repo.findGeneration(companyId, id);
    if (!generation) throw new NotFoundError('Generation not found');
    await this.repo.softDeleteGeneration(id);
    return { id, deleted: true };
  }
}
