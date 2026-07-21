export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  description: string;
  enum?: string[];
}

export interface TelegramMethod {
  name: string;
  category: string;
  description: string;
  parameters: SchemaField[];
  returnType: string;
  examples?: string[];
}

export interface TelegramType {
  name: string;
  category: string;
  description: string;
  fields: SchemaField[];
  variants?: string[];
  examples?: string[];
}

export interface TelegramEnum {
  name: string;
  values: string[];
  description: string;
}

export interface TelegramSchema {
  source: string;
  retrievedAt: string;
  version: string;
  methods: TelegramMethod[];
  types: TelegramType[];
  enums: TelegramEnum[];
}

export const TELEGRAM_BOT_API_URL = "https://core.telegram.org/bots/api";
