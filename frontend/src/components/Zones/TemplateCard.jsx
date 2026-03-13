import React from 'react';
import { Server, ChevronRight, Layers } from 'lucide-react';

/**
 * A single template card used on the ZoneTemplates page.
 *
 * Props:
 *  - template     : { id, name, description, color } — null for "General" card
 *  - siteCount    : number of sites belonging to this template in the zone
 *  - isGeneral    : boolean — true for the "no template" bucket
 *  - onClick      : callback when card is clicked
 */
const TemplateCard = ({ template, siteCount, isGeneral = false, onClick }) => {
  const color = isGeneral ? '#64748b' : (template?.color || '#10B981');
  const name = isGeneral ? 'General' : (template?.name || 'Unnamed');
  const description = isGeneral
    ? 'Sites without a template'
    : (template?.description || '');

  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-xl p-5 cursor-pointer group
        transition-all duration-200
        hover:shadow-lg hover:shadow-black/10
        hover:-translate-y-0.5
        border
        ${isGeneral ? 'border-dashed' : ''}
      `}
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        borderColor: isGeneral ? 'var(--color-border)' : `${color}30`,
        borderLeftWidth: 4,
        borderLeftColor: color,
      }}
    >
      {/* Template icon + name */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${color}15` }}
          >
            <Layers
              size={18}
              style={{ color }}
            />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold th-text-primary text-sm truncate group-hover:text-blue-400 transition-colors">
              {name}
            </h3>
            {description && (
              <p className="text-xs th-text-muted mt-0.5 truncate max-w-[200px]">
                {description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Site count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server size={14} className="th-text-muted" />
          <span className="text-sm font-medium" style={{ color }}>
            {siteCount}
          </span>
          <span className="text-xs th-text-muted">
            {siteCount === 1 ? 'site' : 'sites'}
          </span>
        </div>
        <ChevronRight
          size={16}
          className="th-text-muted group-hover:th-text-secondary group-hover:translate-x-0.5 transition-all"
        />
      </div>

      {/* Hover glow */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${color}08 0%, transparent 70%)`,
        }}
      />
    </div>
  );
};

export default TemplateCard;
