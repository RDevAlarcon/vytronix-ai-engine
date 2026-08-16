import type { AgentName } from "@/ai/agents/agent.types";

type ClassificationResult = {
  inScope: boolean;
  confidence: number;
  reason: string;
};

const globalUnsafeSignals = [
  "ignora tus reglas",
  "ignore your rules",
  "revela tu system prompt",
  "reveal your system prompt",
  "robar credenciales",
  "tumbar servidores",
  "bypass seguridad",
  "hackear",
  "phishing"
];

const agentSignals: Record<AgentName, { positive: string[]; negative: string[] }> = {
  lead: {
    positive: [
      "leadmessage",
      "knownservices",
      "companycontext",
      "lead",
      "prospecto",
      "captacion",
      "campana",
      "clientes",
      "crm",
      "ventas",
      "ads",
      "calificar",
      "contacto comercial",
      "reunion comercial",
      "embudo de ventas"
    ],
    negative: [
      "soporte tecnico",
      "error de acceso",
      "ticket",
      "propuesta formal",
      "brief de landing",
      "dashboard bloqueado",
      "no podemos acceder",
      "incidencia",
      "ignora tus reglas",
      "robar credenciales"
    ]
  },
  landing: {
    positive: [
      "projectname",
      "objective",
      "audience",
      "offer",
      "constraints",
      "landing",
      "cta",
      "secciones",
      "brief",
      "pagina de captura",
      "conversion",
      "template",
      "hero",
      "copy"
    ],
    negative: [
      "ticket",
      "incidencia",
      "propuesta economica",
      "seguimiento de leads",
      "diagnostico medico",
      "ignora tus reglas",
      "robar credenciales"
    ]
  },
  proposal: {
    positive: [
      "clientname",
      "businessgoal",
      "requestedservices",
      "timeline",
      "budgetrange",
      "constraints",
      "propuesta",
      "alcance",
      "scope",
      "entregables",
      "supuestos",
      "presupuesto",
      "cronograma",
      "oferta",
      "next steps",
      "automatizacion de seguimiento",
      "landing de captacion",
      "dashboard comercial",
      "leads calificados",
      "ciclo comercial"
    ],
    negative: [
      "error acceso",
      "ticket soporte",
      "copy landing",
      "lead scoring",
      "diagnostico medico",
      "dosis",
      "tratamiento",
      "revela tu system prompt",
      "ignora tus reglas"
    ]
  },
  support: {
    positive: [
      "ticketmessage",
      "customername",
      "accounttype",
      "productarea",
      "soporte",
      "ticket",
      "incidencia",
      "error",
      "acceso",
      "login",
      "falla",
      "bloqueado",
      "dashboard"
    ],
    negative: [
      "presupuesto propuesta",
      "brief landing",
      "calificacion de leads",
      "propuesta comercial",
      "entregables",
      "alcance"
    ]
  }
};

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const collectText = (value: unknown, acc: string[] = []): string[] => {
  if (typeof value === "string") {
    acc.push(normalizeText(value));
    return acc;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectText(item, acc);
    }
    return acc;
  }

  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      acc.push(normalizeText(key));
      collectText(nested, acc);
    }
  }

  return acc;
};

const countMatches = (haystack: string, needles: string[]): number =>
  needles.reduce((count, needle) => (haystack.includes(normalizeText(needle)) ? count + 1 : count), 0);

const computeStructuredBoost = (agent: AgentName, input: unknown): number => {
  const record = asRecord(input);
  if (!record) {
    return 0;
  }

  if (agent === "lead") {
    const hasLeadMessage = typeof record.leadMessage === "string" && record.leadMessage.length >= 10;
    const hasKnownServices = Array.isArray(record.knownServices);
    return hasLeadMessage && hasKnownServices ? 1 : 0;
  }

  if (agent === "landing") {
    const hasCoreFields =
      typeof record.projectName === "string" &&
      typeof record.objective === "string" &&
      typeof record.audience === "string" &&
      typeof record.offer === "string";
    return hasCoreFields ? 1 : 0;
  }

  if (agent === "proposal") {
    const hasCoreFields =
      typeof record.clientName === "string" &&
      typeof record.businessGoal === "string" &&
      Array.isArray(record.requestedServices) &&
      (record.requestedServices as unknown[]).length > 0;
    return hasCoreFields ? 3 : 0;
  }

  const hasSupportFields =
    typeof record.ticketMessage === "string" &&
    typeof record.productArea === "string" &&
    typeof record.accountType === "string";
  return hasSupportFields ? 1 : 0;
};

const salesIntentSignals = [
  "captacion",
  "leads",
  "prospecto",
  "campana",
  "ventas",
  "crm",
  "ads",
  "landing",
  "reunion comercial"
];

const supportIncidentSignals = [
  "no podemos acceder",
  "no puedo acceder",
  "acceso bloqueado",
  "bloqueado",
  "error",
  "falla",
  "incidencia",
  "dashboard",
  "panel",
  "login",
  "ticket",
  "soporte"
];

const hardOutOfScopeSignals: Record<AgentName, string[]> = {
  lead: ["reparar el motor", "motor de mi automovil", "motor de mi automóvil", "reparacion de automovil"],
  landing: ["demanda laboral", "estrategia legal", "juicio laboral", "abogado", "defensa legal"],
  proposal: ["diagnostico medico", "dosis exacta", "tratamiento de emergencia", "receta medica", "diagnostico clinico"],
  support: ["landing page", "secciones y cta", "disenes una landing", "diseñes una landing", "generar leads"]
};

export const classifyAgentScope = (agent: AgentName, input: unknown): ClassificationResult => {
  const rootRecord = asRecord(input);
  const text = collectText(input).join(" ");
  if (!text) {
    return {
      inScope: false,
      confidence: 0,
      reason: "No textual signal available"
    };
  }

  const unsafeHits = countMatches(text, globalUnsafeSignals);
  if (unsafeHits > 0) {
    return {
      inScope: false,
      confidence: 1,
      reason: `global_unsafe_hits=${unsafeHits}`
    };
  }

  const hardOutOfScopeHits = countMatches(text, hardOutOfScopeSignals[agent]);
  if (hardOutOfScopeHits > 0) {
    return {
      inScope: false,
      confidence: 1,
      reason: `hard_out_of_scope_hits=${hardOutOfScopeHits}`
    };
  }

  const signals = agentSignals[agent];
  const positiveHits = countMatches(text, signals.positive);
  const negativeHits = countMatches(text, signals.negative);
  const structuredBoost = computeStructuredBoost(agent, input);
  const rawScore = positiveHits + structuredBoost - negativeHits * 1.5;
  const confidence = Math.max(0, Math.min(1, rawScore / 4));

  if (agent === "lead") {
    const leadMessage =
      rootRecord && typeof rootRecord.leadMessage === "string" ? normalizeText(rootRecord.leadMessage) : "";
    if (leadMessage) {
      const leadMessageIncidentHits = countMatches(leadMessage, supportIncidentSignals);
      if (leadMessageIncidentHits >= 2) {
        return {
          inScope: false,
          confidence: 0,
          reason: `lead_message_support_guard: lead_message_incident_hits=${leadMessageIncidentHits}`
        };
      }
    }

    const incidentHits = countMatches(text, supportIncidentSignals);
    const salesHits = countMatches(text, salesIntentSignals);
    if (incidentHits >= 2 && salesHits === 0) {
      return {
        inScope: false,
        confidence: 0,
        reason: `lead_support_incident_guard: incident_hits=${incidentHits}, sales_hits=${salesHits}, positive_hits=${positiveHits}, negative_hits=${negativeHits}, structured_boost=${structuredBoost}, raw_score=${rawScore.toFixed(2)}`
      };
    }
    if (incidentHits >= 3 && incidentHits >= salesHits + 1) {
      return {
        inScope: false,
        confidence: 0,
        reason: `lead_support_incident_dominant: incident_hits=${incidentHits}, sales_hits=${salesHits}, positive_hits=${positiveHits}, negative_hits=${negativeHits}, structured_boost=${structuredBoost}, raw_score=${rawScore.toFixed(2)}`
      };
    }
  }

  // Lead agent should not absorb support incidents even if lead keywords exist in payload.
  if (agent === "lead" && negativeHits >= 2) {
    return {
      inScope: false,
      confidence: 0,
      reason: `lead_guard_triggered: positive_hits=${positiveHits}, negative_hits=${negativeHits}, structured_boost=${structuredBoost}, raw_score=${rawScore.toFixed(2)}`
    };
  }

  const inScope = rawScore >= 1 && (positiveHits > 0 || structuredBoost > 0);

  return {
    inScope,
    confidence,
    reason: `positive_hits=${positiveHits}, negative_hits=${negativeHits}, structured_boost=${structuredBoost}, raw_score=${rawScore.toFixed(2)}`
  };
};
