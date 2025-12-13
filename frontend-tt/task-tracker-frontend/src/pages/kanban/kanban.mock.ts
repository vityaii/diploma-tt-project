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
      title: "Login page UI",
      tags: ["auth", "ui"],
      priority: "High",
      assignee: { name: "Viktor", initials: "VN" },
    },
    "2": {
      id: "2",
      title: "Create Kanban layout",
      tags: ["ui"],
      priority: "Medium",
      assignee: { name: "Alex", initials: "A" },
    },
    "3": {
      id: "3",
      title: "Define API contract for tasks",
      tags: ["api", "backend"],
      priority: "Low",
      assignee: { name: "Nikita", initials: "N" },
    },
    "4": {
      id: "4",
      title: "Card details modal draft",
      tags: ["ux"],
      priority: "Medium",
      assignee: { name: "Kate", initials: "K" },
    },
  },
};