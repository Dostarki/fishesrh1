const API = `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000'}/api`;
const TOKEN_KEY = 'frostfish-early-access-token';

async function request(path, { body, token } = {}) {
  const response = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'Could not load Early Access. Please try again.');
  return data;
}

export async function registerEarlyAccess(xName, address) {
  const result = await request('/early-access/participants', { body: { xName, address } });
  localStorage.setItem(TOKEN_KEY, result.accessToken);
  return result.participant;
}

export async function getEarlyAccessProfile() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    return (await request('/early-access/me', { token })).participant;
  } catch (error) {
    if (error.message.includes('participant session')) localStorage.removeItem(TOKEN_KEY);
    throw error;
  }
}

export async function completeEarlyAccessTask(taskId) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error('Please register for Early Access again.');
  const result = await request(`/early-access/tasks/${encodeURIComponent(taskId)}`, { body: {}, token });
  return result;
}

export async function searchEarlyAccessParticipants(search = '') {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return request(`/early-access/participants${query}`);
}
