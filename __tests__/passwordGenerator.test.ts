import {
  generatePassword,
  DEFAULT_OPTIONS,
  GeneratorOptions,
} from "../src/utils/passwordGenerator";

describe("Password Generator", () => {
  describe("generatePassword", () => {
    test("should generate password with default options", () => {
      const password = generatePassword(DEFAULT_OPTIONS);
      expect(password).toBeDefined();
      expect(typeof password).toBe("string");
      expect(password.length).toBe(DEFAULT_OPTIONS.length);
    });

    test("should generate password with custom length", () => {
      const options: GeneratorOptions = {
        length: 24,
        uppercase: true,
        numbers: true,
        symbols: true,
      };
      const password = generatePassword(options);
      expect(password.length).toBe(24);
    });

    test("should include uppercase when uppercase is true", () => {
      const options: GeneratorOptions = {
        length: 20,
        uppercase: true,
        numbers: false,
        symbols: false,
      };
      const password = generatePassword(options);
      // Should contain at least one uppercase
      expect(password).toMatch(/[A-Z]/);
    });

    test("should include numbers when numbers is true", () => {
      const options: GeneratorOptions = {
        length: 20,
        uppercase: false,
        numbers: true,
        symbols: false,
      };
      const password = generatePassword(options);
      // Should contain at least one number
      expect(password).toMatch(/[0-9]/);
    });

    test("should include symbols when symbols is true", () => {
      const options: GeneratorOptions = {
        length: 20,
        uppercase: false,
        numbers: false,
        symbols: true,
      };
      const password = generatePassword(options);
      // Should contain at least one symbol
      expect(password).toMatch(/[!@#$%^&*()_+\-=\[\]{}|;:',.<>?]/);
    });

    test("should generate unique passwords", () => {
      const passwords = new Set<string>();
      for (let i = 0; i < 10; i++) {
        passwords.add(
          generatePassword({
            length: 16,
            uppercase: true,
            numbers: true,
            symbols: true,
          }),
        );
      }
      // All passwords should be unique
      expect(passwords.size).toBe(10);
    });
  });

  describe("DEFAULT_OPTIONS", () => {
    test("should have valid default length", () => {
      expect(DEFAULT_OPTIONS.length).toBeGreaterThan(0);
    });

    test("should have uppercase enabled by default", () => {
      expect(DEFAULT_OPTIONS.uppercase).toBe(true);
    });

    test("should have numbers enabled by default", () => {
      expect(DEFAULT_OPTIONS.numbers).toBe(true);
    });

    test("should have symbols enabled by default", () => {
      expect(DEFAULT_OPTIONS.symbols).toBe(true);
    });
  });
});
