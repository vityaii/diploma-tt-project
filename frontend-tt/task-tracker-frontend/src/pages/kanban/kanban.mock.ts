import type { KanbanBoard } from "./kanban.types";

export const boardMock: KanbanBoard = {
  columns: [
    { id: "todo", title: "To Do", cardIds: ["1", "2"] },
    { id: "inprogress", title: "In Progress", cardIds: ["3"] },
    { id: "review", title: "Review", cardIds: ["4"] },
    { id: "done", title: "Done", cardIds: [] },
  ],
  cards: {
    "1": {
      id: "1",
      taskNumber: 44137,
      title: "Login page UI",
      customer: { name: "Acme Inc." },
      description:
        "Make the login screen match the design system (spacing, typography, error states). Add loading state and basic validation.",
      tags: ["auth", "ui"],
      priority: "High",
      assignee: { name: "Viktor", initials: "VN" },
    },
    "2": {
      id: "2",
      taskNumber: 44138,
      title: "Create Kanban layout",
      customer: { name: "Internal" },
      description:
        "Implement kanban page layout with columns, cards and header actions. Keep visuals consistent with the overall app theme.",
      tags: ["ui"],
      priority: "Medium",
      assignee: { name: "Alex", initials: "A" },
    },
    "3": {
      id: "3",
      taskNumber: 44139,
      title: "Define API contract for tasks",
      customer: { name: "Backend team" },
      description:
        "Define the REST contract: list/create/update tasks, status transitions, and assignee metadata. Document in OpenAPI format.",
      tags: ["api", "backend"],
      priority: "Low",
      assignee: { name: "Nikita", initials: "N" },
    },
    "4": {
      id: "4",
      taskNumber: 44140,
      title: "Card details modal draft",
      customer: { name: "Acme Inc." },
      description:
        "Draft details view: customer, assignee, editable description, and action buttons. Keep it clean and fast to scan.",
      tags: ["ux"],
      priority: "Medium",
      assignee: { name: "Kate", initials: "K" },
    },
  },
};
