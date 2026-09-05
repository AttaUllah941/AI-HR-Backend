import type { AiCompletionRequest, AiCompletionResult, AiProvider } from './ai-provider.js';

/**
 * Deterministic heuristic provider — no external API keys required.
 * Used by default so Phase 11 works offline and in CI.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const userText = [...request.messages]
      .reverse()
      .find((m) => m.role === 'user')
      ?.content?.trim();
    const system = request.messages.find((m) => m.role === 'system')?.content ?? '';
    const content = this.buildResponse(system, userText ?? '');

    return {
      content,
      model: 'mock-nova-1',
      usage: {
        promptTokens: Math.ceil((system.length + (userText?.length ?? 0)) / 4),
        completionTokens: Math.ceil(content.length / 4),
      },
    };
  }

  private buildResponse(system: string, user: string): string {
    const lowerSystem = system.toLowerCase();
    const lowerUser = user.toLowerCase();

    if (lowerSystem.includes('resume') || lowerSystem.includes('screening')) {
      return JSON.stringify(
        {
          score: 78,
          recommendation: 'PROCEED_TO_INTERVIEW',
          strengths: [
            'Relevant role experience',
            'Clear career progression',
            'Skills aligned with job requirements',
          ],
          gaps: ['Limited leadership examples', 'Certifications not listed'],
          summary:
            'Candidate shows solid fit for the role. Recommend a technical interview focused on recent project ownership.',
        },
        null,
        2,
      );
    }

    if (lowerSystem.includes('appraisal') || lowerSystem.includes('performance review')) {
      return JSON.stringify(
        {
          overallRating: 4.1,
          narrative:
            'Strong delivery this cycle with consistent goal progress. Continue mentoring peers and document impact metrics.',
          strengths: ['Owns outcomes', 'Collaborates well', 'Improving KPI trajectory'],
          developmentAreas: ['Delegation', 'Cross-team visibility'],
          recommendedGoals: [
            'Lead one cross-functional initiative',
            'Improve documentation quality score to 90%+',
          ],
        },
        null,
        2,
      );
    }

    if (lowerSystem.includes('policy')) {
      const topic = user.slice(0, 80) || 'workplace policy';
      return [
        `# ${topic}`,
        '',
        '## Purpose',
        'This policy establishes clear expectations and consistent practices across the organization.',
        '',
        '## Scope',
        'Applies to all employees, contractors, and temporary staff.',
        '',
        '## Policy statements',
        '1. Employees must follow applicable laws and company standards.',
        '2. Managers are responsible for communicating expectations.',
        '3. Exceptions require documented HR approval.',
        '',
        '## Compliance',
        'Violations may result in corrective action per the employee handbook.',
        '',
        '## Review',
        'HR reviews this policy annually or when regulations change.',
      ].join('\n');
    }

    if (lowerSystem.includes('insight') || lowerSystem.includes('workforce analytics')) {
      return JSON.stringify(
        {
          insights: [
            {
              title: 'Attendance trend',
              detail: 'Late arrivals are down about 6% week over week in Operations.',
              severity: 'info',
            },
            {
              title: 'Leave concentration',
              detail: 'Three teams have overlapping leave next week — consider coverage planning.',
              severity: 'warning',
            },
            {
              title: 'Hiring funnel',
              detail: 'Interview-to-offer conversion is healthy; screening stage has the longest dwell time.',
              severity: 'info',
            },
          ],
        },
        null,
        2,
      );
    }

    if (lowerSystem.includes('recommendation')) {
      return JSON.stringify(
        {
          recommendations: [
            {
              area: 'Recruitment',
              action: 'Prioritize screening backlog for open engineering roles.',
              impact: 'high',
            },
            {
              area: 'Performance',
              action: 'Close pending mid-year reviews before month end.',
              impact: 'medium',
            },
            {
              area: 'Leave',
              action: 'Remind managers to approve pending leave older than 5 days.',
              impact: 'medium',
            },
          ],
        },
        null,
        2,
      );
    }

    // HR Assistant default
    if (!user) {
      return 'Hi, I am Nova — your Zenith HR assistant. Ask me about leave, attendance, payroll, recruitment, or performance.';
    }

    if (lowerUser.includes('leave')) {
      return 'For leave questions: employees apply under Leave → Requests; managers approve pending items; balances live under Leave → Balances. Want a draft leave policy?';
    }
    if (lowerUser.includes('payroll')) {
      return 'Payroll runs are processed under Payroll → Runs. Ensure salary structures are active before processing. I can outline a payroll checklist if useful.';
    }
    if (lowerUser.includes('recruit') || lowerUser.includes('hiring')) {
      return 'Use Recruitment → Pipeline to move candidates by stage. Resume screening is available under AI → Resume Screening for structured scorecards.';
    }
    if (lowerUser.includes('performance') || lowerUser.includes('review')) {
      return 'Performance reviews and goals are under Performance. I can generate an appraisal draft from an employee review once you open AI → Appraisals.';
    }

    return `Thanks for your question. Based on Zenith HR practices: clarify the process owner, check the relevant module screen, and document decisions in audit logs. You asked: "${user.slice(0, 240)}". I can expand into a checklist or draft policy if you specify the topic.`;
  }
}
