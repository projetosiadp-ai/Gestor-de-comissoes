import React from 'react';

export default class PageLoadErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Falha ao carregar página:', error);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="status error" style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
          <span>Não foi possível carregar esta página. Isso pode acontecer após uma atualização do sistema.</span>
          <button type="button" className="secondary" onClick={this.handleReload}>Recarregar</button>
        </div>
      );
    }
    return this.props.children;
  }
}
