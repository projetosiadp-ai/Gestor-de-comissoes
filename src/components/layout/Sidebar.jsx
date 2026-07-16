import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import dentalPlusLogo from '../../../assets/logo.png';

export default function Sidebar({ collapsed, onToggle, items, activePage, onNavigate, onRefresh }) {
  const navigate = item => {
    onNavigate(item.id);
    if (item.id === 'dashboard' || item.id === 'saved-reports') onRefresh();
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand" style={{ position: 'relative', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          {!collapsed ? (
            <img src={dentalPlusLogo} alt="Dental Plus" style={{ width: '135px' }} />
          ) : (
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', fontWeight: '900', color: '#062a60', fontSize: '15px' }}>D</div>
          )}
          <button className="sidebar-toggle" onClick={onToggle} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        {!collapsed && <span>Gestão de Comissões</span>}
      </div>

      <nav className="side-nav">
        {items.map(item => {
          const Icon = item.icon;
          const active = activePage === item.id;
          return (
            <button key={item.id} className={`nav-item ${active ? 'active' : ''}`} onClick={() => navigate(item)} data-tooltip={item.tooltip}>
              {active && (
                <motion.div
                  layoutId="activeNavPill"
                  className="active-nav-pill"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <Icon size={18} style={{ flexShrink: 0 }} />
              <span className="nav-text">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <strong>Contabilizador de Comissões</strong>
        <span>Uso interno · v1.0</span>
        <small>Desenvolvido por<br /><b>glzn-comercial</b></small>
      </div>
    </aside>
  );
}
