export type Priority = "Low" | "Medium" | "High";

export type KanbanCard = {
  id: string;
  taskNumber: number;
  title: string;
  customer?: { name: string };
  description?: string;
  tags: string[];
  priority: Priority;
  plannedDate?: string;
  durationWeeks: number;
  durationDays: number; 
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
