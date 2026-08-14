import { useMemo, useCallback } from 'react';
import { ReactFlow, Background, Controls, MiniMap, useReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import useAppStore from '../../store/useAppStore';
import BankNode from './nodes/BankNode';
import SupplierNode from './nodes/SupplierNode';
import AnimatedEdge from './edges/AnimatedEdge';
import GraphToolbar from './GraphToolbar';
import GraphStats from './GraphStats';

const nodeTypes = { bankNode: BankNode, supplierNode: SupplierNode };
const edgeTypes = { animated: AnimatedEdge };

function GraphInner() {
  const { reconciliationResult, graphFilters, setSelectedMatch } = useAppStore();
  const { fitView } = useReactFlow();

  const { nodes, edges } = useMemo(() => {
    if (!reconciliationResult) return { nodes: [], edges: [] };
    
    const { matches, missingInBank, missingInSupplier } = reconciliationResult;
    const n = [];
    const e = [];
    
    const bankItemsMap = new Map();
    const supplierItemsMap = new Map();
    
    matches.forEach(match => {
      match.bankItems.forEach(b => bankItemsMap.set(b.id, { ...b, matched: true, matchPass: match.pass }));
      match.ledgerItems.forEach(s => supplierItemsMap.set(s.id, { ...s, matched: true, matchPass: match.pass }));
    });
    
    if (graphFilters.showUnmatched) {
      missingInSupplier.forEach(b => { if (!bankItemsMap.has(b.id)) bankItemsMap.set(b.id, { ...b, matched: false }); });
      missingInBank.forEach(s => { if (!supplierItemsMap.has(s.id)) supplierItemsMap.set(s.id, { ...s, matched: false }); });
    }
    
    const bankItems = Array.from(bankItemsMap.values());
    const supplierItems = Array.from(supplierItemsMap.values());
    
    const NODE_HEIGHT = 90;
    const NODE_GAP = 12;
    const LEFT_X = 0;
    const RIGHT_X = 500;
    
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
        match.ledgerItems.forEach(s => {
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
        });
      });
    });
    
    return { nodes: n, edges: e };
  }, [reconciliationResult, graphFilters]);

  const handleEdgeClick = useCallback((event, edge) => {
    if (!reconciliationResult) return;
    const match = reconciliationResult.matches.find(m => m.id === edge.data?.matchId);
    if (match) setSelectedMatch(match);
  }, [reconciliationResult, setSelectedMatch]);

  const handleNodeClick = useCallback((event, node) => {
    if (!reconciliationResult) return;
    const match = reconciliationResult.matches.find(m =>
      m.bankItems.some(b => b.id === node.id) || m.ledgerItems.some(s => s.id === node.id)
    );
    if (match) setSelectedMatch(match);
  }, [reconciliationResult, setSelectedMatch]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 400 });
  }, [fitView]);

  const handleAutoLayout = useCallback(() => {
    fitView({ padding: 0.2, duration: 400 });
  }, [fitView]);

  if (!reconciliationResult) {
    return (
      <div className="graph-page">
        <div className="empty-state" style={{ height: '100%' }}>
          <h3>Nenhuma conciliação realizada</h3>
          <p>Faça o upload dos razões contábeis na aba Upload para visualizar o grafo de conciliação.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-page">
      <GraphToolbar onFitView={handleFitView} onAutoLayout={handleAutoLayout} />
      <div className="graph-container" style={{ width: '100%', height: '100%' }}>
        <GraphStats />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onEdgeClick={handleEdgeClick}
          onNodeClick={handleNodeClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{ animated: true }}
        >
          <Background color="var(--border-secondary)" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={(node) => node.type === 'bankNode' ? '#22c55e' : '#3b82f6'}
            maskColor="rgba(0,0,0,0.3)"
            style={{ width: 140, height: 90 }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function ReconciliationGraph() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}
