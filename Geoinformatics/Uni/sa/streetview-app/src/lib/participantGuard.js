const getKey = (pid) => `exp_started_${pid}`;

export function hasStarted(pid) {
  return !!localStorage.getItem(getKey(pid));
}

export function markStarted(pid) {
  localStorage.setItem(getKey(pid), "true");
}