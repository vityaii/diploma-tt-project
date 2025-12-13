export type Priority = "Low" | "Medium" | "High";

export type KanbanCard = {
  id: string;
  title: string;
  description?: string;
  tags: string[];
  priority: Priority;
  assignee?: { name: string; initials: string };
};

export type KanbanColumn = {
  id: string;
  title: string;
  cardIds: string[];
};

export type KanbanBoard = {
  columns: KanbanColumn[];
  cards: Record<string, KanbanCard>;
};