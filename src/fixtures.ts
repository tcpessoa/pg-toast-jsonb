export function generateSmallJsonb() {
  return {
    id: crypto.randomUUID(),
    name: `User ${Math.random().toString(36).substring(7)}`,
    updatedAt: new Date().toISOString(),
  };
}

// Generate random base64 string (incompressible)
function generateRandomBase64(bytes: number): string {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buffer));
}

export function generateLargeJsonb() {
  const users = [];
  // Generate incompressible data by using random base64 strings
  // Each user will have ~150 bytes of random data
  for (let i = 0; i < 1000; i++) {
    users.push({
      id: crypto.randomUUID(),
      name: generateRandomBase64(20), // Random 20-byte name
      email: generateRandomBase64(20), // Random 20-byte email
      address: generateRandomBase64(40), // Random 40-byte address
      phone: generateRandomBase64(15), // Random 15-byte phone
      metadata: {
        createdAt: new Date().toISOString(),
        token: generateRandomBase64(32), // Random 32-byte token
        sessionId: crypto.randomUUID(),
        randomData: generateRandomBase64(50), // Extra random data
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
