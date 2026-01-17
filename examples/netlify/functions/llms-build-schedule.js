export async function handler() {
  const hookUrl = process.env.BUILD_HOOK_URL;
  if (!hookUrl) {
    return {
      statusCode: 500,
      body: 'Missing BUILD_HOOK_URL env var.'
    };
  }

  const response = await fetch(hookUrl, { method: 'POST' });
  const body = `Build hook response: ${response.status}`;

  return {
    statusCode: response.ok ? 200 : 500,
    body
  };
}
