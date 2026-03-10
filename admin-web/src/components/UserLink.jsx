import { Link } from 'react-router-dom';

/**
 * Clickable user_id link component.
 * Renders a link to /users/:userId showing email or userId as text.
 * Returns fallback text when userId is null/undefined.
 */
export default function UserLink({ userId, email, fallback = '-' }) {
  if (!userId) return <span>{fallback}</span>;
  return <Link to={`/users/${userId}`}>{email || userId}</Link>;
}
