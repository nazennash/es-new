export const saveRedirectPath = (path) => {
  localStorage.setItem('authRedirectPath', path);
};

export const getAndClearRedirectPath = () => {
  const path = localStorage.getItem('authRedirectPath');
  localStorage.removeItem('authRedirectPath');
  return path;
};
