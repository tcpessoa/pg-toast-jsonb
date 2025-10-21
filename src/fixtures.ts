export function generateSmallJsonb() {
  return {
    id: crypto.randomUUID(),
    name: `User ${Math.random().toString(36).substring(7)}`,
    updatedAt: new Date().toISOString(),
  };
}

export function generateLargeJsonb() {
  const users = [];
  for (let i = 0; i < 1000; i++) {
    users.push({
      id: crypto.randomUUID(),
      name: `User ${i} ${Math.random().toString(36).substring(7)}`,
      email: `user${i}@example.com`,
      address: `${i} Main Street, City ${i}, State ${i % 50}, ZIP ${10000 + i}`,
      phone: `+1-555-${String(i).padStart(4, "0")}`,
      metadata: {
        createdAt: new Date().toISOString(),
        role: ["admin", "user", "moderator"][i % 3],
        preferences: {
          theme: "dark",
          notifications: true,
          language: "en",
        },
      },
    });
  }

  return {
    users,
    updatedAt: new Date().toISOString(),
  };
}

export function getUpdateTimestampQuery(tableName: string): string {
  return `
    UPDATE ${tableName}
    SET data = jsonb_set(data, '{updatedAt}', to_jsonb(NOW()::text))
    WHERE id = 1
  `;
}
