import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminLogin from '../pages/admin/AdminLogin.jsx';

vi.mock('../auth/msalConfig', () => ({
  isAzureAdConfigured: false,
  msalInstance: null,
  loginRequest: {},
}));

describe('AdminLogin', () => {
  const mockOnLogin = vi.fn();

  beforeEach(() => {
    mockOnLogin.mockClear();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();
  });

  it('renders email/password form when Azure AD is not configured', () => {
    render(<AdminLogin onLogin={mockOnLogin} />);
    expect(screen.getByPlaceholderText('Email')).toBeDefined();
    expect(screen.getByPlaceholderText('Password')).toBeDefined();
    expect(screen.getByText('Sign In')).toBeDefined();
  });

  it('renders the Admin Portal heading', () => {
    render(<AdminLogin onLogin={mockOnLogin} />);
    expect(screen.getByText('Admin Portal')).toBeDefined();
  });

  it('shows error on failed login', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Invalid credentials' }),
    });

    render(<AdminLogin onLogin={mockOnLogin} />);
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'admin@csub.edu' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeDefined();
    });
  });

  it('calls onLogin on successful login', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        token: 'test-token',
        user: { id: 1, email: 'admin@csub.edu', displayName: 'Admin', role: 'sysadmin' },
      }),
    });

    render(<AdminLogin onLogin={mockOnLogin} />);
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'admin@csub.edu' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(mockOnLogin).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({ email: 'admin@csub.edu' })
      );
    });
  });
});
