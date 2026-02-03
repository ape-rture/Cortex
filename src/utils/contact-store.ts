import { promises as fs } from "node:fs";
import path from "node:path";
import type { Contact, ContactStore, InteractionRecord } from "../core/types/crm.js";
import { parseContactFile, serializeContact } from "./markdown.js";

const CONTACTS_ROOT = path.resolve("contacts");

function resolvePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
}

async function listContactFiles(): Promise<string[]> {
  const entries = await fs.readdir(CONTACTS_ROOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(CONTACTS_ROOT, entry.name));
}

export class MarkdownContactStore implements ContactStore {
  async loadAll(): Promise<readonly Contact[]> {
    const files = await listContactFiles();
    const contacts = await Promise.all(
      files.map(async (filePath) => {
        const content = await fs.readFile(filePath, "utf8");
        return parseContactFile(content, filePath);
      }),
    );
    return contacts;
  }

  async load(filePath: string): Promise<Contact> {
    const resolved = resolvePath(filePath);
    const content = await fs.readFile(resolved, "utf8");
    return parseContactFile(content, resolved);
  }

  async save(contact: Contact): Promise<void> {
    const targetPath = contact.filePath
      ? resolvePath(contact.filePath)
      : path.join(CONTACTS_ROOT, `${contact.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`);
    const content = serializeContact({ ...contact, filePath: targetPath });
    await fs.writeFile(targetPath, content, "utf8");
  }

  async findByAttioId(attioId: string): Promise<Contact | undefined> {
    const contacts = await this.loadAll();
    return contacts.find((contact) => contact.attioId && contact.attioId === attioId);
  }

  async findByEmail(email: string): Promise<Contact | undefined> {
    const normalized = email.toLowerCase();
    const contacts = await this.loadAll();
    return contacts.find((contact) => contact.contactInfo?.email?.toLowerCase() === normalized);
  }

  async search(query: string): Promise<readonly Contact[]> {
    const normalized = query.toLowerCase();
    const contacts = await this.loadAll();
    return contacts.filter((contact) => {
      return (
        contact.name.toLowerCase().includes(normalized) ||
        (contact.company?.toLowerCase().includes(normalized) ?? false)
      );
    });
  }

  async addInteraction(filePath: string, interaction: InteractionRecord): Promise<void> {
    const contact = await this.load(filePath);
    const updated: Contact = {
      ...contact,
      history: [interaction, ...contact.history],
      lastContact: interaction.date,
    };
    await this.save(updated);
  }
}
