export function auditFromRequest(req, fallbackSource = 'api') {
  if (!req?.user) {
    return { actorId: null, actorRole: '', actionSource: 'system' };
  }
  const role = req.user.role || '';
  let actionSource = fallbackSource;
  if (role === 'mentor') actionSource = 'mentor_ui';
  else if (role === 'mentee') actionSource = 'mentee_ui';
  return {
    actorId: req.user._id,
    actorRole: role,
    actionSource,
  };
}
