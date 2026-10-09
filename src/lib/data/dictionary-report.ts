import { z } from "zod";
import { DICTIONARY_FIELD_LIMIT } from "../report-data";

const DictionaryField = z.object({ name: z.string(), type: z.string().nullable(), description: z.string().nullable() });
/** Loaded with the dictionary, so optional response validation adds nothing to the report's initial JavaScript. */
export const DictionaryReport = z.object({
  mode: z.enum(["sample", "live"]),
  fields: z.array(DictionaryField).max(DICTIONARY_FIELD_LIMIT),
  truncated: z.boolean(),
});
export type DictionaryField = z.infer<typeof DictionaryField>;
export type DictionaryReport = z.infer<typeof DictionaryReport>;
