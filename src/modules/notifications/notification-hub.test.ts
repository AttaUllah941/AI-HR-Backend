import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { MAX_STREAMS_PER_USER, NotificationHub } from './notification-hub.js';
import { formatEvent } from './notification-stream.js';

const event = { id: 'n1', category: 'LEAVE', title: 'Leave request approved' };

function subscriber() {
  return { send: mock.fn(), close: mock.fn() };
}

describe('NotificationHub', () => {
  it('delivers an event only to the addressed user', () => {
    const hub = new NotificationHub();
    const alice = subscriber();
    const bob = subscriber();
    hub.subscribe('alice', alice);
    hub.subscribe('bob', bob);

    hub.publish('alice', event);

    assert.equal(alice.send.mock.callCount(), 1);
    assert.deepEqual(alice.send.mock.calls[0]!.arguments[0], event);
    assert.equal(bob.send.mock.callCount(), 0);
  });

  it('reaches every open tab of the same user', () => {
    const hub = new NotificationHub();
    const a = subscriber();
    const b = subscriber();
    hub.subscribe('alice', a);
    hub.subscribe('alice', b);
    hub.publish('alice', event);
    assert.equal(a.send.mock.callCount(), 1);
    assert.equal(b.send.mock.callCount(), 1);
  });

  it('stops delivering after unsubscribe and forgets empty users', () => {
    const hub = new NotificationHub();
    const a = subscriber();
    const off = hub.subscribe('alice', a);
    off();
    hub.publish('alice', event);
    assert.equal(a.send.mock.callCount(), 0);
    assert.equal(hub.connectionCount(), 0);
  });

  it('closes the oldest stream beyond the per-user cap', () => {
    const hub = new NotificationHub();
    const subs = Array.from({ length: MAX_STREAMS_PER_USER + 1 }, subscriber);
    subs.forEach((s) => hub.subscribe('alice', s));
    assert.equal(subs[0]!.close.mock.callCount(), 1);
    assert.equal(subs[1]!.close.mock.callCount(), 0);
    assert.equal(hub.connectionCount('alice'), MAX_STREAMS_PER_USER);
  });

  it('a failing subscriber does not stop the others or throw to the caller', () => {
    const hub = new NotificationHub();
    const broken = {
      send: mock.fn(() => {
        throw new Error('socket closed');
      }),
      close: mock.fn(),
    };
    const ok = subscriber();
    hub.subscribe('alice', broken);
    hub.subscribe('alice', ok);
    assert.doesNotThrow(() => hub.publish('alice', event));
    assert.equal(ok.send.mock.callCount(), 1);
  });
});

describe('formatEvent', () => {
  it('produces a well-formed SSE frame', () => {
    const frame = formatEvent(event);
    assert.ok(frame.startsWith('event: notification\ndata: '));
    assert.ok(frame.endsWith('\n\n'));
    assert.deepEqual(JSON.parse(frame.split('data: ')[1]!), event);
  });
});
