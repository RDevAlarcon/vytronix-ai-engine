import assert from 'node:assert/strict';
import { runAgent } from '@/ai/agents/agent.router';
import { llmService } from '@/ai/llm/llm.service';
import { groundToolArguments } from '@/ai/tools/tool-argument-grounding';
import { resolveToolSelectionPolicy } from '@/ai/tools/tool-selector';
import { safeContinuationTurn } from '@/ai/tools/tool-continuation';
import { progressionEvidenceSchema, type ToolDefinition } from '@/ai/tools/tool-contract';

export async function runToolContinuationChecks() {
  const read: ToolDefinition = { name: 'booking_check_availability', description: 'Check availability.', sideEffect: 'READ_ONLY', requiresConfirmation: false,
    inputSchema: { type: 'object', properties: { date: { type: 'string', format: 'date' }, resourceRef: { type: 'string' } }, required: ['date'], additionalProperties: false } };
  const target: ToolDefinition = { name: 'booking_create', description: 'Create a new reservation.', sideEffect: 'WRITE', requiresConfirmation: true,
    progression: { prerequisites: [{ prerequisiteTool: read.name, maxAgeSeconds: 300 }], continuation: { argumentFields: ['customerName', 'customerPhone', 'customerEmail'] } },
    inputSchema: { type: 'object', properties: { serviceId: { type: 'string' }, resourceId: { type: 'string' }, startAt: { type: 'string' }, customerName: { type: 'string', minLength: 2 }, customerPhone: { type: 'string', minLength: 7 }, customerEmail: { type: 'string', format: 'email' } }, required: ['serviceId', 'resourceId', 'startAt', 'customerName', 'customerPhone'], additionalProperties: false } };
  const now = Date.now();
  const evidence = { executionId: '00000000-0000-4000-8000-000000000001', targetTool: target.name, prerequisiteTool: read.name, status: 'SUCCEEDED' as const,
    scopeKey: 'OPAQUE_SCOPE_SENTINEL', continuationKey: 'a'.repeat(64), completedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 290000).toISOString() };
  const args = { customerName: 'Vytronix Smoke Test', customerPhone: '+56 9 1234 5678', customerEmail: 'smoke-test@vytronix.local' };
  const message = `Quiero reservar ese horario para ${args.customerName}. Mi teléfono es ${args.customerPhone} y mi correo es ${args.customerEmail}.`;
  for (const ticketMessage of [message, 'Reserva ese horario', 'Quiero agendar ese horario']) {
    assert.deepEqual(resolveToolSelectionPolicy({ ticketMessage }, [read, target], [evidence]).compatibleToolNames, [target.name]);
  }
  for (const ticketMessage of ['¿Qué horarios tiene Rodrigo?', 'Quiero saber si hay un horario', 'Muéstrame horarios disponibles', 'Muéstrame horarios disponibles para reservar después']) {
    assert.deepEqual(resolveToolSelectionPolicy({ ticketMessage }, [read, target], [evidence]).compatibleToolNames, [read.name]);
  }
  for (const state of [[], [{ ...evidence, continuationKey: undefined }], [{ ...evidence, completedAt: new Date(now - 400000).toISOString(), expiresAt: new Date(now - 1000).toISOString() }]]) {
    assert.deepEqual(resolveToolSelectionPolicy({ ticketMessage: message }, [read, target], state).compatibleToolNames, [read.name]);
  }
  for (const suffix of [' pero con Pedro.', ' Mejor a las 18:00.', ' Mejor el martes.', ' Quiero otro servicio.']) assert.equal(safeContinuationTurn(message + suffix, args), false);
  assert.equal(safeContinuationTurn(message, args), true);
  assert.equal(progressionEvidenceSchema.safeParse([{ ...evidence, continuationKey: 'invalid' }]).success, false);
  assert.equal(progressionEvidenceSchema.safeParse([{ ...evidence, unexpected: true }]).success, false);
  const genericRead = { ...read, name: 'inventory_lookup' };
  const genericTarget = { ...target, name: 'order_create', progression: { ...target.progression!, prerequisites: [{ prerequisiteTool: genericRead.name, maxAgeSeconds: 300 }] } };
  assert.deepEqual(resolveToolSelectionPolicy({ ticketMessage: 'Create that item' }, [genericRead, genericTarget], [{ ...evidence, targetTool: genericTarget.name, prerequisiteTool: genericRead.name }]).compatibleToolNames, [genericTarget.name]);
  const original = llmService.chat;
  let calls = 0;
  llmService.chat = async (request) => {
    calls++;
    assert.ok(!JSON.stringify(request.messages).includes(evidence.continuationKey));
    assert.ok(!JSON.stringify(request.messages).includes(evidence.scopeKey));
    if (request.diagnostic?.stage === 'tool_argument_extractor') {
      assert.ok(!JSON.stringify(request.messages).includes('HISTORY_SECRET'));
      assert.ok(!JSON.stringify(request.responseSchema).includes('startAt'));
    }
    return { content: JSON.stringify(request.diagnostic?.stage === 'tool_selector' ? { decision: 'USE_TOOL', tool: target.name } : args), provider: 'llamacpp', model: 'offline', raw: {} };
  };
  try {
    const result = await runAgent({ agent: 'support', input: { ticketMessage: message, knownContext: 'HISTORY_SECRET' }, tools: [read, target], progressionEvidence: [evidence] });
    assert.equal(calls, 2);
    assert.equal(result.orchestration?.action, 'CALL_TOOL');
    assert.equal(result.orchestration?.toolCall.requiresConfirmation, true);
    assert.deepEqual(result.orchestration?.toolCall.arguments, args);
    assert.deepEqual(result.orchestration?.toolCall.continuation, { executionId: evidence.executionId, bindingKey: evidence.continuationKey });
  } finally { llmService.chat = original; }
  const grounded = groundToolArguments({ ticketMessage: '2026-09-14' }, read, { resourceRef: '  ' }, { currentDate: '2026-09-11', timezone: 'America/Santiago' });
  assert.equal(grounded.status, 'READY');
  assert.ok(!('resourceRef' in grounded.arguments));
  assert.ok(groundToolArguments({ ticketMessage: '2026-09-14' }, read, { unknownRef: '' }).ungrounded.includes('unknownRef'));
  assert.ok(groundToolArguments({ ticketMessage: '2026-09-14' }, { ...read, inputSchema: { ...read.inputSchema, required: ['resourceRef'] } }, { resourceRef: '' }).missing.includes('resourceRef'));
}
