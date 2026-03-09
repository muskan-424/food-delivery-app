import React from 'react';
import './ErrorBoundary.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    console.error('Admin Error caught by boundary:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="admin-error-boundary">
          <div className="admin-error-boundary-content">
            <h1>Oops! Something went wrong in Admin Panel</h1>
            <p>We're sorry, but something unexpected happened in the admin interface.</p>
            
            <div className="admin-error-actions">
              <button onClick={this.handleReload} className="admin-error-btn primary">
                Reload Page
              </button>
              <button onClick={this.handleGoHome} className="admin-error-btn secondary">
                Go to Dashboard
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && (
              <details className="admin-error-details">
                <summary>Error Details (Development Only)</summary>
                <pre className="admin-error-stack">
                  {this.state.error && this.state.error.toString()}
                  <br />
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;