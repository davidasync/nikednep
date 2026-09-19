import { customAlphabet } from "nanoid";

import { GENERATED_CODE_LEN } from "../../core/shortener/entity";
import type { CodeGenerator } from "../../core/shortener/ports";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function newGenerator(): CodeGenerator {
  const nanoid = customAlphabet(ALPHABET, GENERATED_CODE_LEN);
  return { next: () => nanoid() };
}
