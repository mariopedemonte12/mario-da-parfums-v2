export type ChatMessageRole = "user" | "assistant" | "error";

export type FragranceReference = {
  id: string;
  name: string;
  brand: string;
  price: number | null;
  imageUrl: string | null;
  /** Where "ver en el catálogo" should take the user. */
  href: string;
};

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  text: string;
  /** Present when the agent called present_fragrances for this turn. */
  fragrances?: FragranceReference[];
};
