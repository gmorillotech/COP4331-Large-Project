import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

class AdminErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { hasError: true, message };
  }

  handleReload() {
    this.setState({ hasError: false, message: '' });
    window.location.href = '/admin';
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0C1A49',
          color: '#f1f5f9',
          gap: '16px',
          fontFamily: 'system-ui, sans-serif',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem' }}>⚠</div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
            Something went wrong in the admin panel
          </h2>
          {this.state.message && (
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8', maxWidth: '480px' }}>
              {this.state.message}
            </p>
          )}
          <button
            onClick={() => this.handleReload()}
            style={{
              marginTop: '8px',
              padding: '10px 24px',
              borderRadius: '10px',
              border: 'none',
              background: '#aa3bff',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Reload Admin Panel
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AdminErrorBoundary;
