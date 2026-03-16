import type { AgentName } from "@/ai/agents/agent.types";

export const agentExamples: Record<AgentName, unknown> = {
  lead: {
    leadMessage:
      "Hola, somos una pyme de Santiago y queremos mejorar captación de clientes con campañas y landing.",
    companyContext: "Vytronix ofrece desarrollo web, automatización y marketing digital para pymes B2B.",
    knownServices: ["Landing pages", "Ads management", "CRM automation"]
  },
  landing: {
    projectName: "Landing para servicio de IA comercial",
    objective: "Captar reuniones calificadas para demo de 30 minutos.",
    audience: "Gerentes comerciales de pymes en Chile",
    offer: "Diagnóstico gratuito de proceso comercial con IA",
    constraints: ["Sin promesas de resultados garantizados", "Publicación en 2 semanas"],
    notes: "Se necesita tono profesional y cercano."
  },
  proposal: {
    clientName: "Comercial Andina",
    businessGoal: "Aumentar leads calificados y acortar ciclo comercial.",
    requestedServices: ["Automatización de seguimiento", "Landing de captación", "Dashboard comercial"],
    timeline: "6 a 8 semanas",
    budgetRange: "USD 4,000 - 7,000",
    constraints: ["Integrar con CRM actual", "Capacitación interna incluida"]
  },
  support: {
    ticketMessage:
      "No podemos acceder al panel desde ayer y el equipo comercial está bloqueado para gestionar oportunidades.",
    customerName: "María González",
    accountType: "Pro",
    productArea: "Dashboard",
    knownContext: "Ocurre desde la última actualización."
  }
};
