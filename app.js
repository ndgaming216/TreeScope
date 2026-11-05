/* TreeScope — interactive BST visualizer. Original implementation. Animation interpolation: LINEAR. */
(() => {
  'use strict';
  const INITIAL = [50, 30, 70, 20, 40, 60, 80];
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const safe = value => Number.isSafeInteger(value);
  class BSTNode {
    constructor(value) { this.value = value; this.left = null; this.right = null; }
  }
  class BinarySearchTree {
    constructor(values = []) { this.root = null; for (const v of values) this.insert(v); }
    insert(v) {
      if (!safe(v)) return false;
      if (!this.root) { this.root = new BSTNode(v); return true; }
      let n = this.root;
      while (n) {
        if (n.value === v) return false;
        const side = v < n.value ? 'left' : 'right';
        if (!n[side]) { n[side] = new BSTNode(v); return true; }
        n = n[side];
      }
      return false;
    }
    search(v) {
      const path = []; let n = this.root;
      while (n) { path.push(n.value); if (n.value === v) return { found:true, path }; n = v < n.value ? n.left : n.right; }
      return { found:false, path };
    }
    delete(v) {
      if (!this.search(v).found) return false;
      const remove = (n, value) => {
        if (!n) return null;
        if (value < n.value) n.left = remove(n.left,value);
        else if (value > n.value) n.right = remove(n.right,value);
        else {
          if (!n.left) return n.right;
          if (!n.right) return n.left;
          let successor = n.right;
          while (successor.left) successor = successor.left;
          n.value = successor.value;
          n.right = remove(n.right,successor.value);
        }
        return n;
      };
      this.root = remove(this.root,v);
      return true;
    }
    traversal(order='inorder') {
      const values = [];
      const walk = n => { if (!n) return; if (order==='preorder') values.push(n.value); walk(n.left); if (order==='inorder') values.push(n.value); walk(n.right); if (order==='postorder') values.push(n.value); };
      walk(this.root);
      return values;
    }
    stats() {
      function measure(n) {
        if (!n) return { count:0, leaves:0, internal:0, height:-1, balanced:true };
        const a=measure(n.left),b=measure(n.right),leaf=!n.left&&!n.right;
        return {count:1+a.count+b.count,leaves:(leaf?1:0)+a.leaves+b.leaves,internal:(leaf?0:1)+a.internal+b.internal,height:1+Math.max(a.height,b.height),balanced:a.balanced&&b.balanced&&Math.abs(a.height-b.height)<=1};
      }
      const s=measure(this.root); let lo=this.root,hi=this.root;
      while (lo?.left) lo=lo.left;
      while (hi?.right) hi=hi.right;
      return {...s,levels:s.count?s.height+1:0,min:lo?.value??null,max:hi?.value??null};
    }
    snapshot() { return clone(this.root); }
    static fromSnapshot(snapshot) { const tree=new BinarySearchTree(); tree.root=clone(snapshot); return tree; }
  }
  const code = {
    insert:['if root is null: create root','compare value with node','value < node: move left','value > node: move right','empty position: create node'],
    delete:['search for value','if 0 children: remove node','if 1 child: promote child','if 2 children: find minimum of right subtree','replace with successor; remove old successor'],
    search:['start at root','if value == node: found','if value < node: go left','otherwise: go right','if null: not found'],
    traversal:['visit(node)','recursively explore left/right subtree','process node at traversal-specific position','return to caller (backtrack)']
  };
  let tree=new BinarySearchTree(INITIAL);
  let plan=null, cursor=-1, timer=null, playing=false, committed=false, compareMode=false;
  let highlighted=[], active=null, found=null, processed=[];
  let lastOperation='inorder';
  const canvas=$('tree-svg');
  const view={ width:960,height:600,centerX:480,centerY:300,zoom:1 };
  const historyKey='treescope-history-v1';
  let history=[];
  try { const saved=JSON.parse(localStorage.getItem(historyKey)||'[]'); if (Array.isArray(saved)) history=saved.slice(0,75); } catch(e) { history=[]; }
  function svgEl(tag,attrs={},text) {
    const el=document.createElementNS(NS,tag);
    Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));
    if(text!==undefined)el.textContent=String(text);
    return el;
  }
  function info(title,text) { $('explanation-title').textContent=title; $('explanation-text').textContent=text; }
  function status(message,error=false) { $('operations-status').textContent=message; $('operations-status').classList.toggle('error',error); }
  function pseudo(kind,line) {
    const rows=code[kind]||[];
    $('pseudo-code').replaceChildren(...rows.map((r,i)=>{
      const div=document.createElement('div'); div.textContent=`${i+1}. ${r}`; if(line===i)div.className='active-code'; return div;
    }));
  }
  function renderStats() {
    const s=tree.stats();
    for(const [key,v] of Object.entries({'stat-nodes':s.count,'stat-height':s.height,'stat-leaves':s.leaves,'stat-internal':s.internal,'stat-min':s.min??'N/A','stat-max':s.max??'N/A','stat-levels':s.levels,'stat-balanced':s.balanced?'Yes':'No'})) $(key).textContent=v;
  }
  function makePositions(root) {
    const nodes=[]; let rank=0;
    function walk(n,depth=0) { if(!n)return; walk(n.left,depth+1); nodes.push({value:n.value,x:100+(rank++)*126,y:104+depth*132,parent:null}); walk(n.right,depth+1); }
    walk(root);
    const byValue=new Map(nodes.map(n=>[n.value,n]));
    const edges=[];
    function connect(n) { if(!n)return; for(const child of [n.left,n.right])if(child){edges.push({key:`${n.value}->${child.value}`,a:byValue.get(n.value),b:byValue.get(child.value)});connect(child);} }
    connect(root);
    const width=Math.max(960,(nodes.length+1)*126+50), height=Math.max(600,...nodes.map(n=>n.y+130));
    return {nodes,edges,width,height};
  }
  function updateView() {
    const w=view.width/view.zoom,h=view.height/view.zoom;
    canvas.setAttribute('viewBox',`${view.centerX-w/2} ${view.centerY-h/2} ${w} ${h}`);
    $('zoom-label').textContent=Math.round(view.zoom*100)+'%';
  }
  function fit() {
    const root=displayRoot(); const p=makePositions(root);
    view.width=p.width;view.height=p.height;view.centerX=p.width/2;view.centerY=p.height/2;view.zoom=1;
    updateView();
  }
  function displayRoot() {
    if (plan&&!plan.compare&&cursor>=0) return plan.steps[cursor].root;
    return tree.root;
  }
  function renderTree(root=displayRoot()) {
    const graph=makePositions(root);
    if(!canvas.querySelector('#tree-edges')) {
      const defs=svgEl('defs'); const marker=svgEl('marker',{id:'tree-arrow',viewBox:'0 0 10 10',refX:'9',refY:'5',markerWidth:'5',markerHeight:'5',orient:'auto'});
      marker.append(svgEl('path',{d:'M0 0 L10 5 L0 10 Z',fill:'#8498aa'}));defs.append(marker);
      canvas.append(defs,svgEl('g',{id:'tree-edges'}),svgEl('g',{id:'tree-nodes'}));
    }
    const edgeLayer=canvas.querySelector('#tree-edges'),nodeLayer=canvas.querySelector('#tree-nodes');
    const keepEdges=new Set(),keepNodes=new Set();
    for(const e of graph.edges) {
      keepEdges.add(e.key);
      let line=[...edgeLayer.children].find(x=>x.dataset.edge===e.key);
      if(!line){line=svgEl('line',{'class':'bst-edge','marker-end':'url(#tree-arrow)'});line.dataset.edge=e.key;edgeLayer.append(line);}
      const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,d=Math.hypot(dx,dy),ux=dx/d,uy=dy/d;
      for(const [k,v] of Object.entries({x1:e.a.x+ux*35,y1:e.a.y+uy*35,x2:e.b.x-ux*39,y2:e.b.y-uy*39}))line.setAttribute(k,v);
    }
    for(const line of [...edgeLayer.children]) if(!keepEdges.has(line.dataset.edge))line.remove();
    for(const n of graph.nodes) {
      keepNodes.add(String(n.value));
      let g=[...nodeLayer.children].find(el=>el.dataset.nodeValue===String(n.value));
      if(!g){g=svgEl('g',{'class':'bst-entity','data-node-value':n.value});g.append(svgEl('circle',{r:34,'class':'bst-node'}),svgEl('text',{'class':'bst-node-label'},n.value));nodeLayer.append(g);requestAnimationFrame(()=>{g.style.opacity='1';});}
      g.setAttribute('transform',`translate(${n.x} ${n.y})`);
      const c=g.querySelector('circle');
      c.classList.toggle('is-visited',highlighted.includes(n.value));
      c.classList.toggle('is-current',active===n.value);
      c.classList.toggle('is-found',found===n.value);
      c.classList.toggle('is-processed',processed.includes(n.value));
    }
    for(const g of [...nodeLayer.children]) if(!keepNodes.has(g.dataset.nodeValue))g.remove();
    if(!graph.nodes.length) { canvas.setAttribute('aria-label','Empty Binary Search Tree'); } else canvas.setAttribute('aria-label','Binary Search Tree with '+graph.nodes.length+' nodes');
  }
  function renderHistory() {
    $('history-count').textContent=`${history.length} operation${history.length===1?'':'s'}`;
    const parent=$('history-list');parent.replaceChildren();
    if(!history.length){const p=document.createElement('p');p.className='history-empty';p.textContent='No operations yet.';parent.append(p);return;}
    for(const h of history){const details=document.createElement('details');details.className='history-entry';const summary=document.createElement('summary');
      const label=document.createElement('span');label.textContent=h.title;
      const stamp=document.createElement('time');stamp.textContent=new Date(h.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      summary.append(label,stamp);details.append(summary);const desc=document.createElement('p');desc.textContent=h.detail;details.append(desc);parent.append(details);
    }
  }
  function addHistory(title,detail) { history.unshift({title,detail,at:Date.now()});history=history.slice(0,75);try{localStorage.setItem(historyKey,JSON.stringify(history));}catch(e){}renderHistory(); }
  function showTraversal(order) {
    lastOperation=order;
    document.querySelectorAll('[data-order]').forEach(b=>{const match=b.dataset.order===order;b.classList.toggle('selected',match);b.setAttribute('aria-selected',match?'true':'false');b.tabIndex=match?0:-1;});
    if(!plan||plan.kind!=='traversal'||committed)$('traversal-result').textContent=tree.traversal(order).join(' → ')||'Tree is empty';
  }
  function stop() {if(timer!==null){clearTimeout(timer);timer=null;}playing=false;$('play-text').textContent='Play';}
  function setBusy(busy) {
    for(const id of ['btn-insert','btn-delete','btn-search','btn-clear','btn-random','btn-reset','btn-preset','random-count','preset-select','node-value','run-inorder','run-preorder','run-postorder']) $(id).disabled=busy;
    $('btn-compare').textContent=compareMode?'Exit Comparison':'Compare Trees';
    document.querySelectorAll('[data-order]').forEach(b=>b.disabled=busy);
  }
  function resetPlayback() {stop();plan=null;cursor=-1;committed=false;highlighted=[];active=null;found=null;processed=[];$('step-label').textContent='Ready';$('progress').max=1;$('progress').value=0;setBusy(false);}
  function pushStep(steps,root,title,description,{current=null,visited=[],result=null,processedNodes=[],line=-1,compare=null}={}) {
    steps.push({root:clone(root),title,description,current,visited:[...visited],result,processed:[...processedNodes],line,compare});
  }
  function startPlan(kind,steps,finalRoot=null,historyRecord=null,order=null) {
    if(!steps.length)return;
    resetPlayback();plan={kind,steps,finalRoot,historyRecord,order,compare:kind==='compare'};cursor=-1;committed=false;setBusy(true);
    $('canvas-state').textContent=kind==='compare'?'BST Comparison':`${kind[0].toUpperCase()+kind.slice(1)} in progress`;
    nextStep();if(cursor<steps.length-1)play();
  }
  function commit() {
    if(committed||!plan)return;
    committed=true;
    if(plan.finalRoot!==null)tree.root=clone(plan.finalRoot);
    renderStats();
    if(plan.historyRecord)addHistory(plan.historyRecord.title,plan.historyRecord.detail);
    if(plan.kind!=='traversal')showTraversal(lastOperation);
    if(plan.kind==='traversal')$('results-note').textContent='Traversal completed. Recursive visits and backtracking were animated.';
    $('canvas-state').textContent=plan.kind==='compare'?'Comparison completed':`${plan.kind} completed`;
    setBusy(false);
  }
  function showStep() {
    if(!plan||cursor<0)return;
    const s=plan.steps[cursor];
    highlighted=s.visited;active=s.current;found=plan.kind==='search'&&s.result?.found?s.current:null;processed=s.processed;
    if(plan.kind==='compare')renderComparisonStep(s.compare);
    else {renderTree(s.root);if(plan.kind==='traversal')$('traversal-result').textContent=s.result?.length?s.result.join(' → '):'Waiting for first processed node…';}
    info(s.title,s.description);pseudo(plan.kind==='compare'?'search':plan.kind,s.line);
    $('step-label').textContent=`Step ${cursor+1} / ${plan.steps.length}`;
    $('progress').max=plan.steps.length;$('progress').value=cursor+1;
    $('btn-prev').disabled=cursor===0;
    $('btn-next').disabled=cursor>=plan.steps.length-1;
    if(cursor===plan.steps.length-1){stop();commit();}
  }
  function nextStep() {if(!plan||cursor>=plan.steps.length-1)return;cursor++;showStep();}
  function prevStep() {if(!plan||cursor<=0)return;stop();cursor--;showStep();}
  function play() {
    if(!plan){status('Choose an operation to start an animation.',true);return;}
    if(playing){stop();return;}
    if(cursor===plan.steps.length-1){cursor=-1;committed=true;}
    playing=true;$('play-text').textContent='Pause';
    function tick(){if(!playing)return;if(cursor>=plan.steps.length-1){stop();return;}nextStep();if(playing)timer=setTimeout(tick,Math.round(850/Number($('speed').value)));}
    timer=setTimeout(tick,Math.round(850/Number($('speed').value)));
  }
  function cancelAnimation() {
    if(!plan)return;
    resetPlayback();renderTree();showTraversal(lastOperation);renderStats();info('Operation canceled','The committed BST has not been changed by the canceled operation.');status('Animation canceled.');
  }
  function parseValue() {
    const raw=$('node-value').value.trim(),num=Number(raw);
    if(!raw||!/^[-+]?\d+$/.test(raw)||!safe(num)){status('Enter a valid safe integer (e.g. 40 or -5).',true);return null;}
    return num;
  }
  function beginInsert(v) {
    if(tree.search(v).found){status(`Duplicate value ${v} is not allowed.`,true);info('Duplicate rejected',`${v} already exists. BST values must be unique.`);return;}
    const steps=[],visited=[];let n=tree.root;
    if(!n)pushStep(steps,tree.root,'Empty tree',`${v} becomes the root because the BST is empty.`,{line:0});
    while(n){visited.push(n.value);const side=v<n.value?'left':'right';pushStep(steps,tree.root,`Compare ${v} with ${n.value}`,`${v} ${v<n.value?'<':'>'} ${n.value}. Move ${side}.`,{current:n.value,visited,line:side==='left'?2:3});n=n[side];}
    const result=BinarySearchTree.fromSnapshot(tree.snapshot());result.insert(v);
    pushStep(steps,result.root,`Inserted ${v}`,`The empty position is filled with ${v}. Tree statistics updated.`,{current:v,visited,result:null,line:4});
    startPlan('insert',steps,result.snapshot(),{title:`Insert ${v}`,detail:`Inserted node ${v}; ${steps.length-1} comparison(s).`});
    status(`Inserting ${v}...`);
  }
  function beginSearch(v) {
    const path=[],steps=[];let n=tree.root;
    if(!n)pushStep(steps,tree.root,'Tree is empty',`Cannot find ${v} in an empty BST.`,{result:{found:false,path:[]},line:4});
    while(n){path.push(n.value);
      if(n.value===v){pushStep(steps,tree.root,`Found ${v}`,`Target equals ${n.value}. Found in ${path.length} comparison(s). Path: ${path.join(' → ')}.`,{current:v,visited:path,result:{found:true,path},line:1});break;}
      const side=v<n.value?'left':'right';pushStep(steps,tree.root,`Compare ${v} with ${n.value}`,`${v} ${v<n.value?'<':'>'} ${n.value}; move ${side}.`,{current:n.value,visited:path,line:side==='left'?2:3});n=n[side];
    }
    if(!n&&path.length)pushStep(steps,tree.root,`${v} not found`,`Reached an empty child after ${path.length} comparison(s). Path: ${path.join(' → ')}.`,{visited:path,result:{found:false,path},line:4});
    const matched=!!n;
    startPlan('search',steps,null,{title:`Search ${v} · ${matched?'Found':'Not found'}`,detail:`${path.length} comparison(s). Path: ${path.join(' → ')||'empty'}.`});
    status(`Searching for ${v}...`);
  }
  function beginDelete(v) {
    const search=tree.search(v);
    if(!search.found){status(`Cannot delete ${v}: value not found.`,true);info('Deletion unsuccessful',`Value ${v} is absent. The BST remains unchanged.`);return;}
    const steps=[],visited=[];let n=tree.root;
    while(n){visited.push(n.value);pushStep(steps,tree.root,`Locate ${v}`,`Visiting ${n.value}. ${v===n.value?'Target located.':v<n.value?'Move left.':'Move right.'}`,{current:n.value,visited,line:0});if(n.value===v)break;n=v<n.value?n.left:n.right;}
    let detail='',kind='';
    if(!n.left&&!n.right){kind='leaf';detail=`${v} is a leaf node, so remove it directly.`;pushStep(steps,tree.root,'Leaf deletion',detail,{current:v,visited,line:1});}
    else if(!n.left||!n.right){kind='one child';detail=`${v} has one child. Connect that child to the parent.`;pushStep(steps,tree.root,'One-child deletion',detail,{current:v,visited,line:2});}
    else{
      kind='two children';detail=`${v} has two children, so find the inorder successor in the right subtree.`;
      pushStep(steps,tree.root,'Two-child deletion',detail,{current:v,visited,line:3});
      let s=n.right;while(s){visited.push(s.value);pushStep(steps,tree.root,`Inspect successor candidate ${s.value}`,s.left?`Move left from ${s.value} to find the smallest value.`:`${s.value} is the smallest value in the right subtree (successor).`,{current:s.value,visited,line:3});if(!s.left)break;s=s.left;}
      detail=`Replace ${v} with successor ${s.value}; remove the successor from its original position, preserving its right child if present.`;
    }
    const result=BinarySearchTree.fromSnapshot(tree.snapshot());result.delete(v);
    pushStep(steps,result.root,`Deleted ${v}`,detail||`Removed node ${v}.`,{visited:[],line:4});
    startPlan('delete',steps,result.snapshot(),{title:`Delete ${v}`,detail:`Successful ${kind} deletion using ${kind==='two children'?'inorder successor':'BST child rules'}.`});
    status(`Deleting ${v}...`);
  }
  function beginTraversal(order) {
    if(!tree.root){status('The tree is empty. Insert nodes before traversing.',true);return;}
    showTraversal(order);
    const steps=[], stack=[],result=[];
    const name={inorder:'Inorder',preorder:'Preorder',postorder:'Postorder'}[order];
    function push(title,desc,current,line){pushStep(steps,tree.root,title,desc,{current,visited:stack,processedNodes:result,result:[...result],line});}
    function visit(n){if(!n)return;stack.push(n.value);push(`Enter node ${n.value}`,`Call ${order}(${n.value}). Stack: ${stack.join(' → ')}.`,n.value,0);
      function process(){result.push(n.value);push(`Process node ${n.value}`,`Append ${n.value} to ${name} result: ${result.join(' → ')}.`,n.value,2);}
      if(order==='preorder')process();
      if(n.left){push(`Explore left of ${n.value}`,`Call traversal on left child ${n.left.value}.`,n.value,1);visit(n.left);}else push(`Left child is empty`,`Return immediately from the empty left child of ${n.value}.`,n.value,1);
      if(order==='inorder')process();
      if(n.right){push(`Explore right of ${n.value}`,`Call traversal on right child ${n.right.value}.`,n.value,1);visit(n.right);}else push('Right child is empty',`Return immediately from the empty right child of ${n.value}.`,n.value,1);
      if(order==='postorder')process();stack.pop();push(`Backtrack from ${n.value}`,`Return to ${stack.length?`parent node ${stack.at(-1)}`:'the caller; traversal is complete'}.`,stack.at(-1)??null,3);
    }
    visit(tree.root);
    startPlan('traversal',steps,null,{title:`${name} traversal`,detail:result.join(' → ')},order);
    $('traversal-result').textContent='Waiting for first processed node…';
    status(`${name} traversal in progress...`);
  }
  function manageTree(values,label) {
    if(tree.root&&!confirm(`${label} will replace the current tree. Continue?`))return;
    resetPlayback();tree=new BinarySearchTree(values);compareMode=false;$('comparison-stage').hidden=true;canvas.hidden=false;$('btn-compare').textContent='Compare Trees';
    renderTree();fit();renderStats();showTraversal(lastOperation);info(label,`${label} completed. The BST now contains ${tree.stats().count} node(s).`);status(`${label} completed.`);$('canvas-state').textContent=label;addHistory(label,`${tree.stats().count} node(s): ${values.join(', ')||'empty'}`);
  }
  function resetTree(clear=false) {manageTree(clear?[]:INITIAL,clear?'Clear Tree':'Reset Sample');}
  const presets={balanced:[40,20,60,10,30,50,70],left:[70,60,50,40,30,20,10],right:[10,20,30,40,50,60,70],deletion:[50,30,70,20,40,60,80,55,65]};
  function drawComparison(svgId,values,path) {
    const target=$(svgId);target.replaceChildren();const t=new BinarySearchTree(values),p=makePositions(t.root);const width=p.width,height=p.height;
    const scale=Math.min(400/width,285/height);const ox=(430-width*scale)/2,oy=(315-height*scale)/2;
    const group=svgEl('g',{transform:`translate(${ox} ${oy}) scale(${scale})`});
    for(const e of p.edges)group.append(svgEl('line',{x1:e.a.x,y1:e.a.y,x2:e.b.x,y2:e.b.y,stroke:'#899eb2','stroke-width':4}));
    for(const n of p.nodes){let c='#405b73';if(path.includes(n.value))c=n.value===70?'#21876d':'#9c86b7';
      group.append(svgEl('circle',{cx:n.x,cy:n.y,r:31,fill:c}));group.append(svgEl('text',{x:n.x,y:n.y+6,'text-anchor':'middle',fill:'white','font-weight':'bold','font-size':20},n.value));}
    target.append(group);
  }
  function renderComparisonStep(c) {
    drawComparison('balanced-svg',presets.balanced,c.left);
    drawComparison('skewed-svg',presets.right,c.right);
    $('balanced-result').textContent=`Height: 2 · ${c.left.length} / 3 comparisons${c.left.length===3?' · Found':''}`;
    $('skewed-result').textContent=`Height: 6 · ${c.right.length} / 7 comparisons${c.right.length===7?' · Found':''}`;
  }
  function beginCompare() {
    if(plan && !committed && !compareMode) { status('Finish the current operation before starting the comparison.',true);return; }
    if(compareMode) {
      resetPlayback();compareMode=false;$('comparison-stage').hidden=true;canvas.hidden=false;$('btn-compare').textContent='Compare Trees';$('canvas-state').textContent='Working BST';renderTree();fit();showTraversal(lastOperation);info('Working BST restored','Comparison mode closed. Your original BST is unchanged.');status('Back to working BST.');return;
    }
    resetPlayback();compareMode=true;$('comparison-stage').hidden=false;canvas.hidden=true;$('btn-compare').textContent='Exit Comparison';
    const steps=[],left=[40,60,70],right=presets.right;
    for(let i=0;i<7;i++){
      const a=left.slice(0,Math.min(3,i+1)),b=right.slice(0,i+1);
      pushStep(steps,tree.root,`Comparison round ${i+1}`,`Balanced tree: ${a.length} comparison(s)${a.length===3?' (found)':''}. Skewed tree: ${b.length} comparison(s)${b.length===7?' (found)':''}. Both contain exactly the same values.`,{line:1,compare:{left:a,right:b}});
    }
    startPlan('compare',steps,null,{title:'Compare balanced vs skewed',detail:'Search 70: balanced BST 3 comparisons, skewed BST 7 comparisons.'});
    status('Comparing balanced and skewed BSTs.');
  }
  // The latest step is a visual snapshot only. Committed BST changes once on completion.
  $('btn-insert').addEventListener('click',()=>{const v=parseValue();if(v!==null)beginInsert(v);});
  $('btn-delete').addEventListener('click',()=>{const v=parseValue();if(v!==null)beginDelete(v);});
  $('btn-search').addEventListener('click',()=>{const v=parseValue();if(v!==null)beginSearch(v);});
  $('node-value').addEventListener('keydown',e=>{if(e.key==='Enter'&&!$('btn-insert').disabled){const v=parseValue();if(v!==null)beginInsert(v);}});
  for(const order of ['inorder','preorder','postorder'])$('run-'+order).addEventListener('click',()=>beginTraversal(order));
  for(const btn of document.querySelectorAll('[data-order]'))btn.addEventListener('click',()=>showTraversal(btn.dataset.order));
  $('btn-random').addEventListener('click',()=>{const count=Number($('random-count').value);if(!safe(count)||count<1||count>15){status('Random node count must be between 1 and 15.',true);return;}const set=new Set();while(set.size<count)set.add(1+Math.floor(Math.random()*99));manageTree([...set],'Random Tree');});
  $('btn-reset').addEventListener('click',()=>resetTree(false));$('btn-clear').addEventListener('click',()=>resetTree(true));
  $('btn-preset').addEventListener('click',()=>{const key=$('preset-select').value;if(!presets[key]){status('Select a preset first.',true);return;}manageTree(presets[key],`Preset: ${key}`);});
  $('examples-nav').addEventListener('click',()=>{$('preset-select').focus();$('preset-select').scrollIntoView({behavior:'smooth',block:'center'});});
  $('btn-compare').addEventListener('click',beginCompare);
  $('btn-play').addEventListener('click',play);$('btn-next').addEventListener('click',()=>{stop();nextStep();});$('btn-prev').addEventListener('click',prevStep);
  $('btn-restart').addEventListener('click',()=>{if(!plan){status('Select an operation before restarting.',true);return;}stop();cursor=0;showStep();});
  $('clear-history').addEventListener('click',()=>{history=[];try{localStorage.removeItem(historyKey);}catch(e){}renderHistory();status('History cleared; tree unchanged.');});
  $('zoom-in').addEventListener('click',()=>{view.zoom=Math.min(2.5,view.zoom+.25);updateView();});
  $('zoom-out').addEventListener('click',()=>{view.zoom=Math.max(.4,view.zoom-.25);updateView();});
  $('fit-top').addEventListener('click',fit);$('fit-bottom').addEventListener('click',fit);
  let pointer=null;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.classList.add('is-dragging');});
  canvas.addEventListener('pointermove',e=>{if(!pointer||e.pointerId!==pointer.id)return;const r=canvas.getBoundingClientRect();const scale=Math.min(r.width/(view.width/view.zoom),r.height/(view.height/view.zoom));view.centerX-=(e.clientX-pointer.x)/scale;view.centerY-=(e.clientY-pointer.y)/scale;pointer.x=e.clientX;pointer.y=e.clientY;updateView();});
  function stopDrag(e){if(!pointer||pointer.id!==e.pointerId)return;pointer=null;canvas.classList.remove('is-dragging');if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}
  canvas.addEventListener('pointerup',stopDrag);canvas.addEventListener('pointercancel',stopDrag);canvas.addEventListener('lostpointercapture',()=>{pointer=null;canvas.classList.remove('is-dragging');});
  for(const btn of document.querySelectorAll('[data-dialog]'))btn.addEventListener('click',()=>$(btn.dataset.dialog).showModal());
  for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d)d.close();});
  // Preserve visual snapshots when user rewinds a finished operation. A new operation begins from the committed tree.
  renderTree();fit();renderStats();showTraversal('inorder');renderHistory();pseudo('search',-1);$('btn-prev').disabled=true;$('btn-next').disabled=true;
  window.TreeScope = Object.freeze({getStats:()=>tree.stats(),getTraversal:order=>tree.traversal(order),getRoot:()=>clone(tree.root),getHistory:()=>clone(history),getStep:()=>({cursor,playing,committed,kind:plan?.kind??null}),getZoom:()=>view.zoom});
})();
