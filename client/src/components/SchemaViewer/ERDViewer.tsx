import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  Layers,
  Table as TableIcon,
  Eye,
  FileCode,
  Key,
  Link as LinkIcon,
  Play,
  Copy,
  Check,
  ChevronRight,
  Sparkles,
  RefreshCw,
  X,
  Compass,
} from 'lucide-react';
import type { ERDData, ERDTableNode, ERDRelationship, SchemaMeta } from '../../types';
import { ApiService } from '../../services/api';

interface ERDViewerProps {
  connectionId: string;
  initialSchema?: string;
  schemas: SchemaMeta[];
  theme?: 'light' | 'dark';
  onOpenTableData: (table: string, schema?: string) => void;
  onOpenTableStructure: (table: string, schema?: string) => void;
  onOpenTableQuery: (table: string, schema?: string) => void;
}

const CARD_WIDTH = 260;
const HEADER_HEIGHT = 44;
const ROW_HEIGHT = 28;

export const ERDViewer: React.FC<ERDViewerProps> = ({
  connectionId,
  initialSchema,
  schemas = [],
  onOpenTableData,
  onOpenTableStructure,
  onOpenTableQuery,
}) => {
  const [erdData, setErdData] = useState<ERDData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSchema, setSelectedSchema] = useState<string>(initialSchema || 'all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Canvas Transform state
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [zoom, setZoom] = useState<number>(0.9);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Node Dragging state
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingNodeKey, setDraggingNodeKey] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Selection & Hover state
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null);
  const [hoveredTableKey, setHoveredTableKey] = useState<string | null>(null);
  const [hoveredRelationId, setHoveredRelationId] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Helper key for tables: schema.tableName
  const getTableKey = (schema: string, name: string) => `${schema}.${name}`;

  // 1. Fetch ERD Data
  const fetchERD = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await ApiService.getERDData(connectionId, selectedSchema);
      setErdData(data);
      autoArrangeNodes(data.tables, data.relationships);
    } catch (err: any) {
      setError(err.message || 'Failed to load ER Diagram');
    } finally {
      setIsLoading(false);
    }
  }, [connectionId, selectedSchema]);

  useEffect(() => {
    fetchERD();
  }, [fetchERD, schemas]);

  // 2. Auto Layout Algorithm
  const autoArrangeNodes = (tables: ERDTableNode[], relationships: ERDRelationship[]) => {
    if (!tables || tables.length === 0) return;

    // Calculate in-degree (how many foreign keys point to this table)
    const inDegree: Record<string, number> = {};
    tables.forEach((t) => {
      inDegree[getTableKey(t.schema, t.name)] = 0;
    });

    relationships.forEach((r) => {
      const targetKey = getTableKey(r.targetSchema, r.targetTable);
      if (inDegree[targetKey] !== undefined) {
        inDegree[targetKey] = (inDegree[targetKey] || 0) + 1;
      }
    });

    // Group tables into hierarchical layers
    const layers: ERDTableNode[][] = [[], [], [], []];
    tables.forEach((t) => {
      const key = getTableKey(t.schema, t.name);
      const fkCount = t.foreignKeys.length;
      const refCount = inDegree[key] || 0;

      if (fkCount === 0 && refCount > 0) {
        // Base / Reference tables (e.g. categories, users)
        layers[0].push(t);
      } else if (fkCount > 0 && refCount > 0) {
        // Intermediate tables (e.g. products, orders)
        layers[1].push(t);
      } else if (fkCount > 0 && refCount === 0) {
        // Leaf / Detail tables (e.g. order_items)
        layers[2].push(t);
      } else {
        // Standalone tables
        layers[3].push(t);
      }
    });

    const newPositions: Record<string, { x: number; y: number }> = {};
    const colSpacing = 360;
    const rowSpacing = 40;
    let startX = 60;

    layers.forEach((layerTables) => {
      if (layerTables.length === 0) return;
      let currentY = 60;

      layerTables.forEach((table) => {
        const key = getTableKey(table.schema, table.name);
        const cardHeight = HEADER_HEIGHT + table.columns.length * ROW_HEIGHT + 16;
        newPositions[key] = { x: startX, y: currentY };
        currentY += cardHeight + rowSpacing;
      });

      startX += colSpacing;
    });

    setNodePositions(newPositions);
  };

  // 3. Zoom Controls
  const handleZoom = (delta: number) => {
    setZoom((prev) => Math.min(Math.max(prev + delta, 0.3), 2.2));
  };

  const handleResetView = () => {
    setZoom(0.9);
    setPan({ x: 50, y: 50 });
  };

  const handleFitView = () => {
    if (!erdData || erdData.tables.length === 0 || !containerRef.current) return;
    const positions = Object.values(nodePositions);
    if (positions.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    erdData.tables.forEach((t) => {
      const pos = nodePositions[getTableKey(t.schema, t.name)];
      if (pos) {
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        const h = HEADER_HEIGHT + t.columns.length * ROW_HEIGHT;
        maxX = Math.max(maxX, pos.x + CARD_WIDTH);
        maxY = Math.max(maxY, pos.y + h);
      }
    });

    const rect = containerRef.current.getBoundingClientRect();
    const padding = 80;
    const diagramWidth = maxX - minX + padding * 2;
    const diagramHeight = maxY - minY + padding * 2;

    const scaleX = rect.width / diagramWidth;
    const scaleY = rect.height / diagramHeight;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.35), 1.2);

    setZoom(newZoom);
    setPan({
      x: (rect.width - (maxX - minX) * newZoom) / 2 - minX * newZoom,
      y: (rect.height - (maxY - minY) * newZoom) / 2 - minY * newZoom,
    });
  };

  // 4. Mouse Canvas Events (Pan & Drag)
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? -0.1 : 0.1;
      handleZoom(zoomFactor);
    } else {
      setPan((prev) => ({
        x: prev.x - e.deltaX * 0.8,
        y: prev.y - e.deltaY * 0.8,
      }));
    }
  };

  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    if (e.button === 0 && !draggingNodeKey) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    } else if (draggingNodeKey) {
      const newX = (e.clientX - dragOffset.x - pan.x) / zoom;
      const newY = (e.clientY - dragOffset.y - pan.y) / zoom;
      setNodePositions((prev) => ({
        ...prev,
        [draggingNodeKey]: { x: Math.max(10, newX), y: Math.max(10, newY) },
      }));
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeKey(null);
  };

  // 5. Node Dragging handler
  const handleMouseDownNode = (e: React.MouseEvent, tableKey: string) => {
    e.stopPropagation();
    const pos = nodePositions[tableKey] || { x: 0, y: 0 };
    setDraggingNodeKey(tableKey);
    setDragOffset({
      x: e.clientX - (pos.x * zoom + pan.x),
      y: e.clientY - (pos.y * zoom + pan.y),
    });
    setSelectedTableKey(tableKey);
  };

  // 6. Filter Tables by Search & Schema
  const filteredTables = useMemo(() => {
    if (!erdData) return [];
    return erdData.tables.filter((t) => {
      const matchesSearch =
        searchTerm === '' ||
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.columns.some((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesSearch;
    });
  }, [erdData, searchTerm]);

  // 7. Selected Table Info
  const selectedTable = useMemo(() => {
    if (!erdData || !selectedTableKey) return null;
    return erdData.tables.find((t) => getTableKey(t.schema, t.name) === selectedTableKey) || null;
  }, [erdData, selectedTableKey]);

  // Inbound and Outbound relationships for Selected Table
  const tableRelationships = useMemo(() => {
    if (!erdData || !selectedTable) return { inbound: [], outbound: [] };
    const inbound = erdData.relationships.filter(
      (r) => r.targetTable === selectedTable.name && r.targetSchema === selectedTable.schema
    );
    const outbound = erdData.relationships.filter(
      (r) => r.sourceTable === selectedTable.name && r.sourceSchema === selectedTable.schema
    );
    return { inbound, outbound };
  }, [erdData, selectedTable]);

  // Generate Automatic JOIN SQL snippet
  const generatedJoinSql = useMemo(() => {
    if (!selectedTable || !erdData) return '';
    let sql = `SELECT\n  ${selectedTable.name}.*\nFROM ${selectedTable.name}\n`;
    
    tableRelationships.outbound.forEach((rel) => {
      sql += `JOIN ${rel.targetTable} ON ${selectedTable.name}.${rel.sourceColumn} = ${rel.targetTable}.${rel.targetColumn}\n`;
    });

    tableRelationships.inbound.forEach((rel) => {
      sql += `LEFT JOIN ${rel.sourceTable} ON ${selectedTable.name}.${rel.targetColumn} = ${rel.sourceTable}.${rel.sourceColumn}\n`;
    });

    sql += `LIMIT 50;`;
    return sql;
  }, [selectedTable, tableRelationships, erdData]);

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(generatedJoinSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  // 8. Render Relationship Connectors (SVG Bezier curves)
  const renderedConnectors = useMemo(() => {
    if (!erdData || !nodePositions) return [];

    return erdData.relationships.map((rel) => {
      const sourceKey = getTableKey(rel.sourceSchema, rel.sourceTable);
      const targetKey = getTableKey(rel.targetSchema, rel.targetTable);

      const sourcePos = nodePositions[sourceKey];
      const targetPos = nodePositions[targetKey];

      if (!sourcePos || !targetPos) return null;

      const sourceTable = erdData.tables.find((t) => getTableKey(t.schema, t.name) === sourceKey);
      const targetTable = erdData.tables.find((t) => getTableKey(t.schema, t.name) === targetKey);

      if (!sourceTable || !targetTable) return null;

      const sourceColIndex = sourceTable.columns.findIndex((c) => c.name === rel.sourceColumn);
      const targetColIndex = targetTable.columns.findIndex((c) => c.name === rel.targetColumn);

      const sourceY = sourcePos.y + HEADER_HEIGHT + Math.max(0, sourceColIndex) * ROW_HEIGHT + ROW_HEIGHT / 2;
      const targetY = targetPos.y + HEADER_HEIGHT + Math.max(0, targetColIndex) * ROW_HEIGHT + ROW_HEIGHT / 2;

      // Determine left or right port
      const isSourceOnLeft = sourcePos.x < targetPos.x;
      const startX = isSourceOnLeft ? sourcePos.x + CARD_WIDTH : sourcePos.x;
      const startY = sourceY;

      const endX = isSourceOnLeft ? targetPos.x : targetPos.x + CARD_WIDTH;
      const endY = targetY;

      const deltaX = Math.abs(endX - startX) * 0.45;
      const control1X = isSourceOnLeft ? startX + deltaX : startX - deltaX;
      const control2X = isSourceOnLeft ? endX - deltaX : endX + deltaX;

      const pathData = `M ${startX} ${startY} C ${control1X} ${startY}, ${control2X} ${endY}, ${endX} ${endY}`;

      const isHighlighted =
        rel.id === hoveredRelationId ||
        sourceKey === hoveredTableKey ||
        targetKey === hoveredTableKey ||
        sourceKey === selectedTableKey ||
        targetKey === selectedTableKey;

      const isDimmed = (selectedTableKey || hoveredTableKey) && !isHighlighted;

      return {
        id: rel.id,
        rel,
        pathData,
        startX,
        startY,
        endX,
        endY,
        isHighlighted,
        isDimmed,
      };
    });
  }, [erdData, nodePositions, hoveredRelationId, hoveredTableKey, selectedTableKey]);

  return (
    <div
      ref={containerRef}
      className={`erd-viewport-container ${isFullscreen ? 'fullscreen' : ''}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--bg-app)',
        userSelect: isPanning || draggingNodeKey ? 'none' : 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDownCanvas}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* ERD Control Bar / Floating Toolbar */}
      <div className="erd-floating-toolbar">
        {/* Schema Filter Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={13} color="var(--accent-primary)" />
          <select
            className="input-select"
            value={selectedSchema}
            onChange={(e) => setSelectedSchema(e.target.value)}
            style={{ height: '28px', fontSize: '0.775rem', padding: '2px 8px', minWidth: '130px' }}
          >
            <option value="all">🌐 All Schemas</option>
            {schemas.map((s) => (
              <option key={s.name} value={s.name}>
                📁 {s.name} ({s.tables.length} tables)
              </option>
            ))}
          </select>
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={12} color="var(--text-dim)" style={{ position: 'absolute', left: '8px' }} />
          <input
            type="text"
            className="input-text"
            placeholder="Search table or column..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ height: '28px', paddingLeft: '26px', paddingRight: '20px', width: '170px', fontSize: '0.75rem' }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{
                position: 'absolute',
                right: '4px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div style={{ width: '1px', height: '18px', background: 'var(--border-subtle)' }} />

        {/* Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => handleZoom(0.1)}
            title="Zoom In (Ctrl + Scroll)"
          >
            <ZoomIn size={14} />
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '38px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => handleZoom(-0.1)}
            title="Zoom Out (Ctrl + Scroll)"
          >
            <ZoomOut size={14} />
          </button>
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={handleFitView}
            title="Fit to Screen"
          >
            <Compass size={14} />
          </button>
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={handleResetView}
            title="Reset Zoom & Pan"
          >
            <RotateCcw size={13} />
          </button>
        </div>

        <div style={{ width: '1px', height: '18px', background: 'var(--border-subtle)' }} />

        {/* Auto Arrange */}
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => erdData && autoArrangeNodes(erdData.tables, erdData.relationships)}
          title="Auto Arrange Table Positions"
          style={{ height: '28px', fontSize: '0.75rem', padding: '0 8px' }}
        >
          <Sparkles size={12} color="var(--accent-primary)" />
          <span>Auto Layout</span>
        </button>

        {/* Refresh */}
        <button
          className="btn btn-ghost btn-sm btn-icon"
          onClick={fetchERD}
          title="Refresh ERD Data"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>

        {/* Fullscreen */}
        <button
          className="btn btn-ghost btn-sm btn-icon"
          onClick={() => setIsFullscreen(!isFullscreen)}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>

      {/* Info Stats Badge */}
      {erdData && (
        <div className="erd-stats-badge">
          <span>{filteredTables.length} Tables</span>
          <span style={{ opacity: 0.4 }}>•</span>
          <span>{erdData.relationships.length} Relationships</span>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="erd-loading-overlay">
          <div className="spinner-large" />
          <div style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Building Entity Relationship Diagram...
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="erd-error-banner">
          <span>{error}</span>
          <button className="btn btn-secondary btn-sm" onClick={fetchERD}>
            Retry
          </button>
        </div>
      )}

      {/* Main Interactive Canvas */}
      {!isLoading && !error && (
        <div
          style={{
            flex: 1,
            position: 'relative',
            cursor: isPanning ? 'grabbing' : 'grab',
          }}
        >
          {/* Transform Layer */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              pointerEvents: 'none',
            }}
          >
            {/* SVG Relationship Connector Lines */}
            <svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '10000px',
                height: '10000px',
                pointerEvents: 'none',
                overflow: 'visible',
              }}
            >
              <defs>
                {/* Arrow markers */}
                <marker
                  id="erd-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--accent-primary)" />
                </marker>
                <marker
                  id="erd-arrow-active"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
                </marker>
                {/* Crow's Foot circle connector */}
                <marker id="erd-dot" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="4" markerHeight="4">
                  <circle cx="3" cy="3" r="2.5" fill="var(--accent-primary)" />
                </marker>
              </defs>

              {renderedConnectors.map((c) => {
                if (!c) return null;
                const { id, rel, pathData, startX, startY, endX, endY, isHighlighted, isDimmed } = c;

                const strokeColor = isHighlighted ? '#38bdf8' : 'var(--accent-primary)';
                const strokeWidth = isHighlighted ? 2.5 : 1.5;
                const strokeOpacity = isDimmed ? 0.15 : isHighlighted ? 1 : 0.65;

                return (
                  <g
                    key={id}
                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredRelationId(id)}
                    onMouseLeave={() => setHoveredRelationId(null)}
                  >
                    {/* Background wide hit-box line */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                    />

                    {/* Visible Bezier Curve */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeOpacity={strokeOpacity}
                      strokeDasharray={isHighlighted ? 'none' : 'none'}
                      markerEnd={isHighlighted ? 'url(#erd-arrow-active)' : 'url(#erd-arrow)'}
                      markerStart="url(#erd-dot)"
                      style={{
                        transition: 'stroke 0.15s ease, stroke-width 0.15s ease, stroke-opacity 0.15s ease',
                        filter: isHighlighted ? 'drop-shadow(0 0 6px rgba(56, 189, 248, 0.6))' : 'none',
                      }}
                    />

                    {/* Hover Tooltip Label */}
                    {isHighlighted && (
                      <foreignObject
                        x={(startX + endX) / 2 - 90}
                        y={(startY + endY) / 2 - 14}
                        width={180}
                        height={28}
                        style={{ overflow: 'visible', pointerEvents: 'none' }}
                      >
                        <div className="erd-relation-pill">
                          <LinkIcon size={10} color="#38bdf8" />
                          <span>{rel.sourceColumn} ➔ {rel.targetTable}.{rel.targetColumn}</span>
                        </div>
                      </foreignObject>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Table Nodes */}
            {filteredTables.map((table) => {
              const tableKey = getTableKey(table.schema, table.name);
              const pos = nodePositions[tableKey] || { x: 50, y: 50 };
              const isSelected = selectedTableKey === tableKey;
              const isHovered = hoveredTableKey === tableKey;

              // Check if any relation connects to this table
              const isConnectedToSelected =
                selectedTableKey &&
                erdData?.relationships.some(
                  (r) =>
                    (getTableKey(r.sourceSchema, r.sourceTable) === selectedTableKey &&
                      getTableKey(r.targetSchema, r.targetTable) === tableKey) ||
                    (getTableKey(r.targetSchema, r.targetTable) === selectedTableKey &&
                      getTableKey(r.sourceSchema, r.sourceTable) === tableKey)
                );

              const isDimmed =
                (selectedTableKey || hoveredTableKey) &&
                !isSelected &&
                !isHovered &&
                !isConnectedToSelected;

              return (
                <div
                  key={tableKey}
                  className={`erd-table-card ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${isDimmed ? 'dimmed' : ''}`}
                  style={{
                    position: 'absolute',
                    transform: `translate(${pos.x}px, ${pos.y}px)`,
                    width: `${CARD_WIDTH}px`,
                    pointerEvents: 'auto',
                    zIndex: isSelected ? 30 : isHovered ? 20 : 10,
                  }}
                  onMouseDown={(e) => handleMouseDownNode(e, tableKey)}
                  onMouseEnter={() => setHoveredTableKey(tableKey)}
                  onMouseLeave={() => setHoveredTableKey(null)}
                >
                  {/* Table Header */}
                  <div className="erd-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', flex: 1 }}>
                      <TableIcon size={14} color="var(--accent-primary)" />
                      <span className="erd-table-name" title={table.name}>
                        {table.name}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {table.schema && table.schema !== 'default' && (
                        <span className="erd-schema-badge">{table.schema}</span>
                      )}
                      {table.rowCount !== undefined && (
                        <span className="erd-rowcount-badge" title="Estimated rows">
                          {table.rowCount} r
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Columns List */}
                  <div className="erd-card-body">
                    {table.columns.map((col) => {
                      const isPk = table.primaryKeys.includes(col.name);
                      const fk = table.foreignKeys.find((f) => f.column === col.name);

                      return (
                        <div
                          key={col.name}
                          className={`erd-column-row ${isPk ? 'is-pk' : ''} ${fk ? 'is-fk' : ''}`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden', flex: 1 }}>
                            {isPk && (
                              <span className="erd-key-badge pk" title="Primary Key">
                                <Key size={10} /> PK
                              </span>
                            )}
                            {fk && (
                              <span
                                className="erd-key-badge fk"
                                title={`Foreign Key: references ${fk.referencedTable}.${fk.referencedColumn}`}
                              >
                                <LinkIcon size={10} /> FK
                              </span>
                            )}
                            {!isPk && !fk && <span style={{ width: '6px' }} />}

                            <span
                              className={`erd-col-name ${isPk || fk ? 'key-col' : ''}`}
                              title={col.name}
                            >
                              {col.name}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span className="erd-col-type" title={col.type}>
                              {col.type.toLowerCase()}
                            </span>
                            {!col.nullable && (
                              <span className="erd-notnull-dot" title="NOT NULL">•</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Quick Card Action Footer */}
                  <div className="erd-card-footer">
                    <button
                      className="erd-card-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTableData(table.name, table.schema);
                      }}
                      title="Open Data Grid"
                    >
                      <Eye size={11} /> Data
                    </button>
                    <button
                      className="erd-card-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTableStructure(table.name, table.schema);
                      }}
                      title="Inspect DDL & Structure"
                    >
                      <FileCode size={11} /> DDL
                    </button>
                    <button
                      className="erd-card-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTableQuery(table.name, table.schema);
                      }}
                      title="Query Table"
                    >
                      <Play size={11} /> Query
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Table Inspector Side Drawer */}
      {selectedTable && (
        <div className="erd-inspector-drawer">
          <div className="erd-inspector-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TableIcon size={16} color="var(--accent-primary)" />
              <div>
                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selectedTable.name}
                </h4>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                  Schema: {selectedTable.schema || 'default'} • {selectedTable.columns.length} columns
                </span>
              </div>
            </div>

            <button
              className="btn btn-ghost btn-sm btn-icon"
              onClick={() => setSelectedTableKey(null)}
              title="Close Details"
            >
              <X size={14} />
            </button>
          </div>

          <div className="erd-inspector-body">
            {/* Quick action buttons */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onOpenTableData(selectedTable.name, selectedTable.schema)}
                style={{ flex: 1, fontSize: '0.75rem' }}
              >
                <Eye size={12} /> Open Data
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onOpenTableStructure(selectedTable.name, selectedTable.schema)}
                style={{ flex: 1, fontSize: '0.75rem' }}
              >
                <FileCode size={12} /> DDL & Indexes
              </button>
            </div>

            {/* Outgoing Relations */}
            <div className="erd-inspector-section">
              <div className="erd-section-title">
                <span>References ({tableRelationships.outbound.length})</span>
              </div>
              {tableRelationships.outbound.length === 0 ? (
                <div className="erd-empty-text">No outgoing foreign keys</div>
              ) : (
                tableRelationships.outbound.map((r) => (
                  <div
                    key={r.id}
                    className="erd-relation-row"
                    onClick={() => setSelectedTableKey(getTableKey(r.targetSchema, r.targetTable))}
                  >
                    <ChevronRight size={12} color="var(--accent-primary)" />
                    <span style={{ color: 'var(--text-secondary)' }}>{r.sourceColumn}</span>
                    <span style={{ color: 'var(--text-dim)' }}>➔</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{r.targetTable}.{r.targetColumn}</strong>
                  </div>
                ))
              )}
            </div>

            {/* Inbound Relations */}
            <div className="erd-inspector-section">
              <div className="erd-section-title">
                <span>Referenced By ({tableRelationships.inbound.length})</span>
              </div>
              {tableRelationships.inbound.length === 0 ? (
                <div className="erd-empty-text">No tables reference this table</div>
              ) : (
                tableRelationships.inbound.map((r) => (
                  <div
                    key={r.id}
                    className="erd-relation-row"
                    onClick={() => setSelectedTableKey(getTableKey(r.sourceSchema, r.sourceTable))}
                  >
                    <ChevronRight size={12} color="#38bdf8" />
                    <strong style={{ color: 'var(--text-primary)' }}>{r.sourceTable}.{r.sourceColumn}</strong>
                    <span style={{ color: 'var(--text-dim)' }}>➔</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{r.targetColumn}</span>
                  </div>
                ))
              )}
            </div>

            {/* Auto Generated JOIN Query */}
            <div className="erd-inspector-section">
              <div className="erd-section-title" style={{ justifyContent: 'space-between' }}>
                <span>Auto JOIN Query</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={copySqlToClipboard}
                  style={{ height: '20px', padding: '0 6px', fontSize: '0.7rem' }}
                >
                  {copiedSql ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                  <span>{copiedSql ? 'Copied' : 'Copy SQL'}</span>
                </button>
              </div>
              <pre className="erd-sql-preview">
                <code>{generatedJoinSql}</code>
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
