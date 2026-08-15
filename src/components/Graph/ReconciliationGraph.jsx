import { useMemo, useCallback } from 'react';
import { ReactFlow, Background, Controls, MiniMap, useReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import useAppStore from '../../store/useAppStore';
import BankNode from './nodes/BankNode';
import SupplierNode from './nodes/SupplierNode';
import AnimatedEdge from './edges/AnimatedEdge';
import GraphToolbar from './GraphToolbar';
import GraphStats from './GraphStats';
import TableView from './TableView';

const nodeTypes = { bankNode: BankNode, supplierNode: SupplierNode };
const edgeTypes = { animated: AnimatedEdge };

function GraphInner() {
  const { reconciliationResult, graphFilters, setSelectedMatch, searchQuery } = useAppStore();
  const { fitView } = useReactFlow();

  const { nodes, edges } = useMemo(() => {
    if (!reconciliationResult) return { nodes: [], edges: [] };
    
    const { matches = [], missingInBank = [], missingInSupplier = [] } = reconciliationResult;
    const n = [];
    const e = [];
    
    const bankItemsMap = new Map();
    const supplierItemsMap = new Map();
    
    matches.forEach(match => {
      match.bankItems.forEach(b => bankItemsMap.set(b.id, { ...b, matched: true, matchPass: match.pass }));
      (match.ledgerItems || match.supplierItems || []).forEach(s => supplierItemsMap.set(s.id, { ...s, matched: true, matchPass: match.pass }));
    });
    
    if (graphFilters.showUnmatched) {
      missingInSupplier.forEach(b => { if (!bankItemsMap.has(b.id)) bankItemsMap.set(b.id, { ...b, matched: false }); });
      missingInBank.forEach(s => { if (!supplierItemsMap.has(s.id)) supplierItemsMap.set(s.id, { ...s, matched: false }); });
    }
    
    let bankItems = Array.from(bankItemsMap.values());
    let supplierItems = Array.from(supplierItemsMap.values());

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toUpperCase().trim();
      bankItems = bankItems.filter(b => `${b.description || ''} ${b.cnpj || ''} ${b.amount}`.toUpperCase().includes(q));
      supplierItems = supplierItems.filter(s => `${s.description || ''} ${s.cnpj || ''} ${s.amount}`.toUpperCase().includes(q));
    }
    
    const NODE_HEIGHT = 90;
    const NODE_GAP = 14;
    const LEFT_X = 0;
    const RIGHT_X = 480;
    
    bankItems.forEach((item, i) => {
      n.push({
        id: item.id,
        type: 'bankNode',
        position: { x: LEFT_X, y: i * (NODE_HEIGHT + NODE_GAP) },
        data: {
          amount: item.amount,
          date: item.date,
          description: item.description,
          matched: item.matched,
          matchPass: item.matchPass || null,
        },
      });
    });
    
    supplierItems.forEach((item, i) => {
      n.push({
        id: item.id,
        type: 'supplierNode',
        position: { x: RIGHT_X, y: i * (NODE_HEIGHT + NODE_GAP) },
        data: {
          amount: item.amount,
          date: item.date,
          description: item.description,
          matched: item.matched,
          matchPass: item.matchPass || null,
        },
      });
    });
    
    matches.forEach(match => {
      const passKey = `showPass${match.pass}`;
      if (graphFilters[passKey] === false) return;
      
      match.bankItems.forEach(b => {
        (match.ledgerItems || match.supplierItems || []).forEach(s => {
          if (n.some(node => node.id === b.id) && n.some(node => node.id === s.id)) {
            e.push({
              id: `edge-${b.id}-${s.id}`,
              source: b.id,
              target: s.id,
              type: 'animated',
              data: {
                confidence: match.confidence,
                pass: match.pass,
                passName: match.passName,
                notes: match.notes,
                matchId: match.id,
              },
            });
          }
        });
      });
    });
    
    return { nodes: n, edges: e };
  }, [reconciliationResult, graphFilters, searchQuery]);

  const handleEdgeClick = useCallback((event, edge) => {
    if (!reconciliationResult) return;
    const match = reconciliationResult.matches.find(m => m.id === edge.data?.matchId);
    if (match) setSelectedMatch(match);
  }, [reconciliationResult, setSelectedMatch]);

  const handleNodeClick = useCallback((event, node) => {
    if (!reconciliationResult) return;
    const match = reconciliationResult.matches.find(m =>
      m.bankItems.some(b => b.id === node.id) || (m.ledgerItems || m.supplierItems || []).some(s => s.id === node.id)
    );
    if (match) setSelectedMatch(match);
  }, [reconciliationResult, setSelectedMatch]);

  return (
    <div className="graph-container" style={{ width: '100%', height: 'calc(100vh - 170px)', position: 'relative' }}>
      <GraphStats />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onEdgeClick={handleEdgeClick}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background color="var(--border-primary)" gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}
        />
      </ReactFlow>
    </div>
  );
}

export default function ReconciliationGraph() {
  const { reconciliationResult, viewMode, setActivePage } = useAppStore();

  const handleFitView = useCallback(() => {}, []);
  const handleAutoLayout = useCallback(() => {}, []);

  if (!reconciliationResult) {
    return (
      <div className="graph-page">
        <div className="empty-state" style={{ height: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h3>Nenhuma conciliação realizada</h3>
          <p>Faça o upload dos razões contábeis na aba Upload para visualizar o resultado.</p>
          <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => setActivePage('upload')}>
            Ir para Upload dos Razões
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-page fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <GraphToolbar onFitView={handleFitView} onAutoLayout={handleAutoLayout} />
      
      {viewMode === 'table' ? (
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          <TableView />
        </div>
      ) : (
        <ReactFlowProvider>
          <GraphInner />
        </ReactFlowProvider>
      )}
    </div>
  );
}
