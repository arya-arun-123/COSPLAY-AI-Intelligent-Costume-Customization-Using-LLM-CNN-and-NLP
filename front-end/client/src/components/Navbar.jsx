import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';

function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const { itemCount } = useCart();

  return (
    <nav className="main-nav">
      {/* Nav Links (Left) */}
      <div className="nav-links">
        <Link to="/products">New</Link>
        <Link to="/products">Collections</Link>
        <Link to="/products">Essentials</Link>

        {/* Saved AI Designs */}
        {isAuthenticated && (
          <Link to="/saved-designs">
            Saved Designs
          </Link>
        )}
      </div>

      {/* Brand Logo (Centered) */}
      <Link to="/" className="logo">
        Cosplay.
      </Link>

      {/* Nav Icons & Actions (Right) */}
      <div className="nav-icons">
        <Link to="/products">
          Search
        </Link>

        <Link to="/cart">
          Cart ({itemCount || 0})
        </Link>

        {isAuthenticated ? (
          <button
            onClick={logout}
            style={{
              color: 'var(--clay)',
              cursor: 'pointer',
            }}
          >
            Logout (
            {user?.name?.split(' ')[0] ||
              'User'}
            )
          </button>
        ) : (
          <Link to="/login">
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}

export default Navbar;