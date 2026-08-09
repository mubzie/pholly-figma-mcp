figma.showUI(__html__, {width: 380, height: 260});

const storedFileKey = figma.root.getPluginData('pholly-file-key');
const fileKey = figma.fileKey || storedFileKey || `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
if (!figma.fileKey && !storedFileKey) figma.root.setPluginData('pholly-file-key', fileKey);

const sendFileInfo = () => figma.ui.postMessage({
  type: 'file-info',
  fileKey,
  name: figma.root.name,
  pageId: figma.currentPage.id,
  pageName: figma.currentPage.name,
  editorType: figma.editorType
});

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'ready') { sendFileInfo(); return; }
  if (msg.type !== 'request') return;
  try { const result = await execute(msg.method, msg.params ?? {}); figma.ui.postMessage({type:'response', id:msg.id, ok:true, result}); }
  catch (e) { figma.ui.postMessage({type:'response', id:msg.id, ok:false, error:{code:'PLUGIN_ERROR',message:e instanceof Error?e.message:String(e)}}); }
};

sendFileInfo();
setTimeout(sendFileInfo, 250);
setTimeout(sendFileInfo, 1000);
setTimeout(sendFileInfo, 2500);

async function execute(method:string, p:any):Promise<any> {
  switch(method) {
    case 'get_metadata': return {fileKey,name:figma.root.name,pages:figma.root.children.map(x=>({id:x.id,name:x.name})),currentPage:{id:figma.currentPage.id,name:figma.currentPage.name}};
    case 'get_selection': return figma.currentPage.selection.map(node=>serialize(node,p.depth??6));
    case 'inspect_selection': return inspectSelection(p);
    case 'export_selection_assets': return exportSelectionAssets(p);
    case 'get_document': return serialize(figma.currentPage, p.depth ?? 6);
    case 'get_node': return serialize(figma.getNodeById(p.nodeId));
    case 'get_design_context': return serialize(figma.getNodeById(p.nodeId) ?? figma.currentPage, p.depth ?? 3);
    case 'get_styles': return {paint:(await figma.getLocalPaintStylesAsync()).map(styleSummary),text:(await figma.getLocalTextStylesAsync()).map(styleSummary),effect:(await figma.getLocalEffectStylesAsync()).map(styleSummary),grid:(await figma.getLocalGridStylesAsync()).map(styleSummary)};
    case 'get_variable_defs': { const collections=await figma.variables.getLocalVariableCollectionsAsync();return Promise.all(collections.map(async c=>({id:c.id,name:c.name,modes:c.modes,variables:(await Promise.all(c.variableIds.map(id=>figma.variables.getVariableByIdAsync(id)))).filter(Boolean).map(variableSummary)}))); }
    case 'create_variable_collection': { const c=figma.variables.createVariableCollection(p.name); return variableCollectionSummary(c); }
    case 'create_variable': { const c=await figma.variables.getVariableCollectionByIdAsync(p.collectionId); if(!c)throw new Error('Variable collection not found'); const v=figma.variables.createVariable(p.name,c,p.resolvedType); for(const [mode,value] of Object.entries(p.valuesByMode??{}))v.setValueForMode(mode,value as any); return variableSummary(v); }
    case 'set_variable_values': { const v=await figma.variables.getVariableByIdAsync(p.variableId);if(!v)throw new Error('Variable not found');for(const [mode,value] of Object.entries(p.valuesByMode??{}))v.setValueForMode(mode,value as any);return variableSummary(v); }
    case 'bind_variable': { const n=requireNode(p.nodeId) as any; const v=p.variableId?await figma.variables.getVariableByIdAsync(p.variableId):null;if(p.variableId&&!v)throw new Error('Variable not found');n.setBoundVariable(p.field,v);return serialize(n); }
    case 'get_screenshot': { const n=figma.getNodeById(p.nodeId) as any; if(!n||!('exportAsync' in n)) throw new Error('Exportable node not found'); const bytes=await n.exportAsync({format:p.format??'PNG',constraint:p.scale?{type:'SCALE',value:p.scale}:undefined}); return {format:p.format??'PNG',base64:toBase64(bytes)}; }
    case 'set_node_properties': { const n=requireNode(p.nodeId) as any; applyProps(n,p.properties); return serialize(n); }
    case 'set_text_content': { const n=requireNode(p.nodeId); if(n.type!=='TEXT')throw new Error('Node is not text'); await figma.loadFontAsync(n.fontName as FontName); n.characters=p.text; return serialize(n); }
    case 'set_text_properties': { const n=requireNode(p.nodeId);if(n.type!=='TEXT')throw new Error('Node is not text'); await figma.loadFontAsync(n.fontName as FontName); const x=p.properties??{}; if(x.fontName){await figma.loadFontAsync(x.fontName);n.fontName=x.fontName;} if(x.fontSize!==undefined)n.fontSize=x.fontSize;if(x.textAlignHorizontal)n.textAlignHorizontal=x.textAlignHorizontal;if(x.textAlignVertical)n.textAlignVertical=x.textAlignVertical;if(x.textAutoResize)n.textAutoResize=x.textAutoResize;if(x.x!==undefined)n.x=x.x;if(x.y!==undefined)n.y=x.y;if(x.width!==undefined)n.resize(x.width,n.height);if(x.height!==undefined)n.resize(n.width,x.height);return serialize(n); }
    case 'set_solid_fill': { const n=requireNode(p.nodeId) as any; const paint={type:'SOLID',color:p.paint.color??p.paint,opacity:p.paint.opacity??1}; n[p.target==='strokes'?'strokes':'fills']=[paint]; return serialize(n); }
    case 'set_auto_layout': { const n=requireNode(p.nodeId) as any;if(!('layoutMode'in n))throw new Error('Node does not support auto layout'); const l=p.layout??{}; if(l.direction)n.layoutMode=l.direction;if(l.paddingTop!==undefined)n.paddingTop=l.paddingTop;if(l.paddingRight!==undefined)n.paddingRight=l.paddingRight;if(l.paddingBottom!==undefined)n.paddingBottom=l.paddingBottom;if(l.paddingLeft!==undefined)n.paddingLeft=l.paddingLeft;if(l.gap!==undefined)n.itemSpacing=l.gap;if(l.primaryAxisAlignItems)n.primaryAxisAlignItems=l.primaryAxisAlignItems;if(l.counterAxisAlignItems)n.counterAxisAlignItems=l.counterAxisAlignItems;return serialize(n); }
    case 'set_selection': { figma.currentPage.selection=p.nodeIds.map(requireNode);return figma.currentPage.selection.map(node=>serialize(node)); }
    case 'scroll_and_zoom_into_view': { const nodes=p.nodeIds.map(requireNode);figma.viewport.scrollAndZoomIntoView(nodes);return {framed:p.nodeIds}; }
    case 'create_frame': return createNode('FRAME',p.node,p.parentId);
    case 'create_text': return createNode('TEXT',p.node,p.parentId);
    case 'create_shape': return createNode(p.node?.type??'RECTANGLE',p.node,p.parentId);
    case 'create_image': return createImage(p);
    case 'create_component': { const source=requireNode(p.nodeId);if(source.type==='COMPONENT')return serialize(source);const c=figma.createComponentFromNode(source);if(p.name)c.name=p.name;return serialize(c); }
    case 'create_instance': { const c=requireNode(p.componentId);if(c.type!=='COMPONENT')throw new Error('Node is not a component');const i=c.createInstance();(p.parentId?requireNode(p.parentId):figma.currentPage as any).appendChild(i);return serialize(i); }
    case 'set_instance_properties': { const i=requireNode(p.nodeId);if(i.type!=='INSTANCE')throw new Error('Node is not an instance');i.setProperties(p.properties??{});return serialize(i); }
    case 'swap_instance_component': { const i=requireNode(p.nodeId);const c=requireNode(p.componentId);if(i.type!=='INSTANCE'||c.type!=='COMPONENT')throw new Error('Expected instance and component');i.swapComponent(c);return serialize(i); }
    case 'detach_instance': { const i=requireNode(p.nodeId);if(i.type!=='INSTANCE')throw new Error('Node is not an instance');return serialize(i.detachInstance()); }
    case 'commit_undo': figma.commitUndo(); return {committed:true};
    case 'batch': { const results=[];for(const operation of p.operations??[]){if(['delete_nodes','batch'].includes(operation.method))throw new Error(`Method ${operation.method} is not allowed inside batch`);results.push(await execute(operation.method,{...operation.params,fileKey:p.fileKey??operation.params?.fileKey}));}return results; }
    case 'duplicate_nodes': return p.nodeIds.map((id:string)=>requireNode(id).clone()).map((node:SceneNode)=>serialize(node));
    case 'reparent_nodes': { const parent=requireNode(p.parentId);for(const id of p.nodeIds){const n=requireNode(id);if(!('appendChild'in parent))throw new Error('Parent cannot contain children');(parent as ChildrenMixin).appendChild(n);}return p.nodeIds.map((id:string)=>serialize(requireNode(id))); }
    case 'group_nodes': { const nodes=p.nodeIds.map(requireNode);if(!nodes.length)throw new Error('No nodes supplied');const parent=p.parentId?requireNode(p.parentId):nodes[0].parent;if(!parent||!('appendChild'in parent))throw new Error('Invalid group parent');const group=figma.group(nodes,parent as BaseNode&ChildrenMixin);if(p.name)group.name=p.name;return serialize(group); }
    case 'ungroup_node': { const n=requireNode(p.nodeId);if(!('children'in n))throw new Error('Node cannot be ungrouped');return figma.ungroup(n as SceneNode&ChildrenMixin).map(node=>serialize(node)); }
    case 'validate_design': return validateTree(p.tree);
    case 'render_design': { const result=await renderTree(p.tree,p.parentId?requireNode(p.parentId):figma.currentPage,p.mode??'append');if(p.commitUndo)figma.commitUndo();return result; }
    case 'delete_nodes': if(!p.confirm)throw new Error('Deletion requires confirm=true');for(const id of p.nodeIds){const n=figma.getNodeById(id);if(n)n.remove();}return {deleted:p.nodeIds};
    default: throw new Error(`Unsupported method: ${method}`);
  }
}
function requireNode(id:string):SceneNode { const n=figma.getNodeById(id);if(!n)throw new Error(`Node not found: ${id}`);return n as SceneNode; }
function applyProps(n:any,p:any){for(const k of ['name','x','y','rotation','opacity','visible','cornerRadius'])if(p[k]!==undefined)n[k]=p[k];if(p.width!==undefined||p.height!==undefined)n.resize(p.width??n.width,p.height??n.height);if(p.fills)n.fills=p.fills;if(p.strokes)n.strokes=p.strokes;if(p.effects)n.effects=p.effects;}
function createNode(type:string,s:any,parentId?:string){const parent:any=parentId?requireNode(parentId):figma.currentPage;let n:any=type==='TEXT'?figma.createText():type==='ELLIPSE'?figma.createEllipse():type==='LINE'?figma.createLine():type==='FRAME'?figma.createFrame():figma.createRectangle();parent.appendChild(n);applyProps(n,s??{});if(s?.text)Object.assign(n,s.text);return serialize(n);}
async function createImage(p:any){const n:any=figma.createRectangle();(p.parentId?requireNode(p.parentId):figma.currentPage as any).appendChild(n);let bytes:Uint8Array;if(p.src.startsWith('data:'))bytes=Uint8Array.from(atob(p.src.split(',')[1]),c=>c.charCodeAt(0));else bytes=new Uint8Array(await (await fetch(p.src)).arrayBuffer());n.fills=[{type:'IMAGE',imageHash:figma.createImage(bytes).hash,scaleMode:'FILL'}];applyProps(n,p.node??{});return serialize(n);}
async function renderTree(tree:any,parent:any,mode:string):Promise<any>{const visit=async(d:any,p:any):Promise<SceneNode>=>{let n:any;if(mode==='reconcile'&&d.key&&'children'in p)n=(p as ChildrenMixin).children.find(x=>x.getPluginData('pholly-key')===d.key);if(!n){const r=createNode(d.type,{...d,content:undefined},p.id);n=figma.getNodeById(r.id)!;}else applyProps(n,d);if(d.key)n.setPluginData('pholly-key',d.key);if(d.content!==undefined&&n.type==='TEXT'){await figma.loadFontAsync(n.fontName as FontName);n.characters=d.content;}if(d.children&&'children'in n)for(const c of d.children)await visit(c,n);return n;};return serialize(await visit(tree,parent));}
function styleSummary(s:any){return {id:s.id,name:s.name,key:s.key,description:s.description};}
function validateTree(tree:any){const errors:string[]=[];const keys=new Set<string>();const types=new Set(['FRAME','TEXT','RECTANGLE','ELLIPSE','LINE']);const visit=(n:any,path:string)=>{if(!n||typeof n!=='object'){errors.push(`${path} must be an object`);return;}if(!types.has(n.type))errors.push(`${path}.type is unsupported: ${String(n.type)}`);if(n.key){if(keys.has(n.key))errors.push(`${path}.key is duplicated: ${n.key}`);keys.add(n.key);}for(const field of ['width','height'])if(n[field]!==undefined&&(!(n[field]>0)||!Number.isFinite(n[field])))errors.push(`${path}.${field} must be a positive finite number`);if(n.opacity!==undefined&&(n.opacity<0||n.opacity>1))errors.push(`${path}.opacity must be between 0 and 1`);if(n.children!==undefined&&!Array.isArray(n.children))errors.push(`${path}.children must be an array`);else n.children?.forEach((c:any,i:number)=>visit(c,`${path}.children[${i}]`));};visit(tree,'tree');return {valid:errors.length===0,errors,nodeCount:countTree(tree)};}
function countTree(n:any):number{return n&&typeof n==='object'?1+(Array.isArray(n.children)?n.children.reduce((sum:number,c:any)=>sum+countTree(c),0):0):0;}
function variableSummary(v:any){return {id:v.id,name:v.name,description:v.description,resolvedType:v.resolvedType,variableCollectionId:v.variableCollectionId,valuesByMode:v.valuesByMode,scopes:v.scopes};}
function variableCollectionSummary(c:any){return {id:c.id,name:c.name,modes:c.modes,defaultModeId:c.defaultModeId,variableIds:c.variableIds};}
function toBase64(bytes:Uint8Array){let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);}
function jsonSafe(value:any):any{if(typeof value==='symbol')return 'MIXED';if(Array.isArray(value))return value.map(jsonSafe);if(value&&typeof value==='object'){const out:any={};for(const key of Object.keys(value)){const next=jsonSafe(value[key]);if(next!==undefined)out[key]=next;}return out;}return value;}
function serialize(n:any,depth=6):any{if(!n)return null;const o:any={id:n.id,type:n.type,name:n.name};if('characters'in n)o.content=jsonSafe(n.characters);if('x'in n){o.x=jsonSafe(n.x);o.y=jsonSafe(n.y);o.width=jsonSafe(n.width);o.height=jsonSafe(n.height);o.rotation=jsonSafe(n.rotation);o.opacity=jsonSafe(n.opacity);o.visible=jsonSafe(n.visible);}if('fills'in n)o.fills=jsonSafe(n.fills);if('strokes'in n)o.strokes=jsonSafe(n.strokes);if('effects'in n)o.effects=jsonSafe(n.effects);if('layoutMode'in n)o.layout=jsonSafe({mode:n.layoutMode,itemSpacing:n.itemSpacing,paddingTop:n.paddingTop,paddingRight:n.paddingRight,paddingBottom:n.paddingBottom,paddingLeft:n.paddingLeft});if(depth>0&&'children'in n)o.children=n.children.map((x:any)=>serialize(x,depth-1));return o;}

async function inspectSelection(p:any):Promise<any>{
  const depth=Math.max(0,Math.min(12,Number.isFinite(p.depth)?Math.floor(p.depth):8));
  const scale=Math.max(0.1,Math.min(4,Number.isFinite(p.scale)?p.scale:1));
  const includeHidden=p.includeHidden===true;
  const vectorMaxSize=Math.max(16,Math.min(4096,Number.isFinite(p.vectorMaxSize)?p.vectorMaxSize:512));
  const nodes:SceneNode[]=p.nodeId?[requireNode(p.nodeId)]:[...figma.currentPage.selection];
  if(!nodes.length)throw new Error('No Figma node is selected. Select a frame or pass nodeId.');
  const primary:any=nodes[0];
  const inventory=collectInventories(nodes,includeHidden,vectorMaxSize);
  const result:any={
    source:p.nodeId?'node':'selection',
    file:{fileKey,name:figma.root.name,pageId:figma.currentPage.id,pageName:figma.currentPage.name},
    selectionCount:nodes.length,
    primaryNodeId:primary.id,
    implementationRules:implementationRules(),
    textInventory:inventory.textInventory,
    assetInventory:inventory.assetInventory,
    nodes:nodes.map(node=>uiSpecification(node,depth,includeHidden))
  };
  if(p.includeScreenshot!==false&&'exportAsync'in primary){
    const format=p.format==='JPG'?'JPG':'PNG';
    const bytes=await primary.exportAsync({format,constraint:{type:'SCALE',value:scale}});
    result.screenshot={format,scale,base64:toBase64(bytes)};
  }
  return result;
}

async function exportSelectionAssets(p:any):Promise<any>{
  const includeHidden=p.includeHidden===true;
  const vectorMaxSize=Math.max(16,Math.min(4096,Number.isFinite(p.vectorMaxSize)?p.vectorMaxSize:512));
  const nodes:SceneNode[]=p.nodeId?[requireNode(p.nodeId)]:[...figma.currentPage.selection];
  if(!nodes.length)throw new Error('No Figma node is selected. Select a frame or pass nodeId.');
  const inventory=collectInventories(nodes,includeHidden,vectorMaxSize);
  const assets:any[]=[];
  const failures:any[]=[];
  if(p.includeRaster!==false){
    for(const candidate of inventory.assetInventory.filter((asset:any)=>asset.kind==='raster')){
      try{
        const image=figma.getImageByHash(candidate.imageHash);
        if(!image)throw new Error('Figma image data is unavailable');
        let bytes=await image.getBytesAsync();
        let mimeType=detectImageMime(bytes);
        let kind='raster';
        if(!mimeType){
          const owner:any=figma.getNodeById(candidate.nodeIds[0]);
          if(!owner||!('exportAsync'in owner))throw new Error('Unknown raster format and owning node is not exportable');
          bytes=await owner.exportAsync({format:'PNG'});
          mimeType='image/png';
          kind='raster-render';
        }
        assets.push({...candidate,kind,mimeType,base64:toBase64(bytes)});
      }catch(error){failures.push({assetKey:candidate.assetKey,kind:candidate.kind,nodeIds:candidate.nodeIds,message:error instanceof Error?error.message:String(error)});}
    }
  }
  if(p.includeVectors!==false){
    for(const candidate of inventory.assetInventory.filter((asset:any)=>asset.kind==='vector')){
      try{
        const node:any=figma.getNodeById(candidate.nodeId);
        if(!node||!('exportAsync'in node))throw new Error('Vector asset node is unavailable or not exportable');
        try{const bytes=await node.exportAsync({format:'SVG'});assets.push({...candidate,mimeType:'image/svg+xml',base64:toBase64(bytes)});}
        catch{const bytes=await node.exportAsync({format:'PNG',constraint:{type:'SCALE',value:2}});assets.push({...candidate,kind:'vector-render',mimeType:'image/png',base64:toBase64(bytes)});}
      }catch(error){failures.push({assetKey:candidate.assetKey,kind:candidate.kind,nodeIds:[candidate.nodeId],message:error instanceof Error?error.message:String(error)});}
    }
  }
  return {source:p.nodeId?'node':'selection',file:{fileKey,name:figma.root.name,pageId:figma.currentPage.id,pageName:figma.currentPage.name},selectionCount:nodes.length,implementationRules:implementationRules(),textInventory:inventory.textInventory,assetInventory:inventory.assetInventory,assets,failures};
}

function uiSpecification(node:SceneNode,depth:number,includeHidden=false):any{
  const n:any=node;
  const geometry=compact({x:safeRead(n,'x'),y:safeRead(n,'y'),width:safeRead(n,'width'),height:safeRead(n,'height'),rotation:safeRead(n,'rotation'),absoluteBoundingBox:safeRead(n,'absoluteBoundingBox')});
  const appearance=compact({visible:safeRead(n,'visible'),opacity:safeRead(n,'opacity'),blendMode:safeRead(n,'blendMode'),fills:normalizePaints(safeRead(n,'fills')),strokes:normalizePaints(safeRead(n,'strokes')),strokeWeight:safeRead(n,'strokeWeight'),strokeAlign:safeRead(n,'strokeAlign'),dashPattern:safeRead(n,'dashPattern'),cornerRadius:safeRead(n,'cornerRadius'),topLeftRadius:safeRead(n,'topLeftRadius'),topRightRadius:safeRead(n,'topRightRadius'),bottomRightRadius:safeRead(n,'bottomRightRadius'),bottomLeftRadius:safeRead(n,'bottomLeftRadius'),effects:normalizeEffects(safeRead(n,'effects'))});
  const layout=compact({mode:safeRead(n,'layoutMode'),wrap:safeRead(n,'layoutWrap'),itemSpacing:safeRead(n,'itemSpacing'),counterAxisSpacing:safeRead(n,'counterAxisSpacing'),paddingTop:safeRead(n,'paddingTop'),paddingRight:safeRead(n,'paddingRight'),paddingBottom:safeRead(n,'paddingBottom'),paddingLeft:safeRead(n,'paddingLeft'),primaryAxisAlignItems:safeRead(n,'primaryAxisAlignItems'),counterAxisAlignItems:safeRead(n,'counterAxisAlignItems'),primaryAxisSizingMode:safeRead(n,'primaryAxisSizingMode'),counterAxisSizingMode:safeRead(n,'counterAxisSizingMode'),layoutAlign:safeRead(n,'layoutAlign'),layoutGrow:safeRead(n,'layoutGrow'),layoutPositioning:safeRead(n,'layoutPositioning'),minWidth:safeRead(n,'minWidth'),maxWidth:safeRead(n,'maxWidth'),minHeight:safeRead(n,'minHeight'),maxHeight:safeRead(n,'maxHeight'),constraints:safeRead(n,'constraints'),clipsContent:safeRead(n,'clipsContent')});
  const styles=compact({fillStyleId:safeRead(n,'fillStyleId'),strokeStyleId:safeRead(n,'strokeStyleId'),effectStyleId:safeRead(n,'effectStyleId'),textStyleId:safeRead(n,'textStyleId'),gridStyleId:safeRead(n,'gridStyleId'),boundVariables:safeRead(n,'boundVariables')});
  const spec:any={id:n.id,type:n.type,name:n.name,geometry,appearance,layout,styles,css:cssHints(n,appearance,layout)};
  if(n.type==='TEXT')spec.text=textSpecification(n);
  if(n.type==='INSTANCE')spec.instance=compact({componentProperties:safeRead(n,'componentProperties'),mainComponent:safeNodeReference(safeReadRaw(n,'mainComponent'))});
  if(n.type==='COMPONENT'||n.type==='COMPONENT_SET')spec.component=compact({propertyDefinitions:safeRead(n,'componentPropertyDefinitions'),variantProperties:safeRead(n,'variantProperties')});
  if(depth>0&&'children'in n)spec.children=n.children.filter((child:SceneNode)=>includeHidden||(child as any).visible!==false).map((child:SceneNode)=>uiSpecification(child,depth-1,includeHidden));
  return compact(spec);
}

function collectInventories(nodes:SceneNode[],includeHidden:boolean,vectorMaxSize:number):{textInventory:any[];assetInventory:any[]}{
  const textInventory:any[]=[];
  const vectorAssets:any[]=[];
  const rasterAssets=new Map<string,any>();
  const visit=(node:SceneNode,parentPath:string,effectiveParentVisible:boolean)=>{
    const n:any=node;
    const ownVisible=safeReadRaw(n,'visible')!==false;
    const effectiveVisible=effectiveParentVisible&&ownVisible;
    if(!effectiveVisible&&!includeHidden)return;
    const segment=String(n.name||n.type||n.id).replace(/\//g,'∕');
    const layerPath=parentPath?`${parentPath}/${segment}`:segment;
    if(n.type==='TEXT')textInventory.push({nodeId:n.id,layerPath,visible:effectiveVisible,content:safeRead(n,'characters'),typography:textSpecification(n)});
    const fills=safeReadRaw(n,'fills');
    if(Array.isArray(fills))fills.forEach((paint:any,index:number)=>{if(paint?.type==='IMAGE'&&typeof paint.imageHash==='string'&&paint.imageHash){const key=`image:${paint.imageHash}`;const existing=rasterAssets.get(key);if(existing){if(!existing.nodeIds.includes(n.id))existing.nodeIds.push(n.id);if(!existing.layerPaths.includes(layerPath))existing.layerPaths.push(layerPath);}else rasterAssets.set(key,{assetKey:key,kind:'raster',imageHash:paint.imageHash,nodeIds:[n.id],layerPaths:[layerPath],suggestedName:`${n.name||'image'}-${index+1}`,scaleMode:paint.scaleMode});}});
    if(isVectorAssetRoot(n,effectiveVisible,vectorMaxSize)){vectorAssets.push({assetKey:`node:${n.id}`,kind:'vector',nodeId:n.id,nodeIds:[n.id],layerPaths:[layerPath],suggestedName:n.name||`vector-${n.id.replace(':','-')}`,exportFormat:'SVG',width:safeRead(n,'width'),height:safeRead(n,'height')});return;}
    if('children'in n)for(const child of n.children as SceneNode[])visit(child,layerPath,effectiveVisible);
  };
  for(const node of nodes)visit(node,'',true);
  return {textInventory,assetInventory:[...rasterAssets.values(),...vectorAssets]};
}

function isVectorAssetRoot(n:any,effectiveVisible:boolean,maxSize:number):boolean{
  if(!effectiveVisible)return false;
  const vectorTypes=new Set(['VECTOR','BOOLEAN_OPERATION','STAR','POLYGON']);
  if(vectorTypes.has(n.type))return true;
  if(!['GROUP','FRAME','COMPONENT','INSTANCE'].includes(n.type)||!('children'in n))return false;
  if(typeof n.width!=='number'||typeof n.height!=='number'||n.width<=0||n.height<=0||n.width>maxSize||n.height>maxSize)return false;
  const profile=subtreeProfile(n);
  return profile.hasVector&&!profile.hasText;
}

function subtreeProfile(node:any):{hasVector:boolean;hasText:boolean}{
  const vectorTypes=new Set(['VECTOR','BOOLEAN_OPERATION','STAR','POLYGON']);
  let hasVector=vectorTypes.has(node.type);let hasText=node.type==='TEXT';
  if('children'in node)for(const child of node.children as any[]){if(child.visible===false)continue;const profile=subtreeProfile(child);hasVector=hasVector||profile.hasVector;hasText=hasText||profile.hasText;if(hasVector&&hasText)break;}
  return {hasVector,hasText};
}

function implementationRules():string[]{return ['Use only visible copy from textInventory; do not invent, rewrite, or add text.','Call export_selection_assets and use the written asset paths instead of substituting icon libraries, emoji, gradients, or placeholders.','Respect layer order, geometry, auto-layout, typography, colors, radii, strokes, and effects from nodes.','If an asset appears in assetInventory but cannot be exported, report it explicitly instead of silently replacing it.'];}

function detectImageMime(bytes:Uint8Array):string|undefined{if(bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47)return'image/png';if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>=6&&String.fromCharCode(...bytes.subarray(0,6)).startsWith('GIF8'))return'image/gif';if(bytes.length>=12&&String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP')return'image/webp';return undefined;}

function textSpecification(n:any):any{
  let segments:any;
  try{segments=n.getStyledTextSegments(['fontName','fontSize','fontWeight','lineHeight','letterSpacing','textCase','textDecoration','fills']).map((segment:any)=>({...jsonSafe(segment),fills:normalizePaints(segment.fills)}));}catch{}
  return compact({content:safeRead(n,'characters'),fontName:safeRead(n,'fontName'),fontSize:safeRead(n,'fontSize'),fontWeight:safeRead(n,'fontWeight'),lineHeight:safeRead(n,'lineHeight'),letterSpacing:safeRead(n,'letterSpacing'),textAlignHorizontal:safeRead(n,'textAlignHorizontal'),textAlignVertical:safeRead(n,'textAlignVertical'),textAutoResize:safeRead(n,'textAutoResize'),paragraphIndent:safeRead(n,'paragraphIndent'),paragraphSpacing:safeRead(n,'paragraphSpacing'),textCase:safeRead(n,'textCase'),textDecoration:safeRead(n,'textDecoration'),hyperlink:safeRead(n,'hyperlink'),segments});
}

function cssHints(n:any,appearance:any,layout:any):any{
  const solidFills=Array.isArray(appearance.fills)?appearance.fills.filter((paint:any)=>paint?.type==='SOLID'&&paint.css).map((paint:any)=>paint.css):[];
  const shadows=Array.isArray(appearance.effects)?appearance.effects.filter((effect:any)=>effect?.css).map((effect:any)=>effect.css):[];
  const padding=[layout.paddingTop,layout.paddingRight,layout.paddingBottom,layout.paddingLeft];
  const radius=appearance.cornerRadius!=='MIXED'&&appearance.cornerRadius!==undefined?px(appearance.cornerRadius):undefined;
  return compact({display:layout.mode&&layout.mode!=='NONE'?'flex':undefined,flexDirection:layout.mode==='HORIZONTAL'?'row':layout.mode==='VERTICAL'?'column':undefined,flexWrap:layout.wrap==='WRAP'?'wrap':undefined,gap:px(layout.itemSpacing),padding:padding.every(value=>typeof value==='number')?padding.map(px).join(' '):undefined,justifyContent:axisAlignment(layout.primaryAxisAlignItems),alignItems:axisAlignment(layout.counterAxisAlignItems),width:px(safeRead(n,'width')),height:px(safeRead(n,'height')),opacity:appearance.opacity,background:solidFills.length?solidFills.join(', '):undefined,borderRadius:radius,boxShadow:shadows.length?shadows.join(', '):undefined,overflow:layout.clipsContent?'hidden':undefined});
}

function normalizePaints(value:any):any{
  if(value===undefined)return undefined;if(value==='MIXED'||typeof value==='symbol')return 'MIXED';if(!Array.isArray(value))return jsonSafe(value);
  return value.map((paint:any)=>{const out:any=jsonSafe(paint);if(paint?.type==='SOLID'&&paint.color)out.css=cssColor(paint.color,paint.opacity);if(Array.isArray(paint?.gradientStops))out.gradientStops=paint.gradientStops.map((stop:any)=>({...jsonSafe(stop),css:cssColor(stop.color)}));if(paint?.type==='IMAGE')out.contentHint='Raster image fill';return out;});
}

function normalizeEffects(value:any):any{
  if(value===undefined)return undefined;if(value==='MIXED'||typeof value==='symbol')return 'MIXED';if(!Array.isArray(value))return jsonSafe(value);
  return value.map((effect:any)=>{const out:any=jsonSafe(effect);if((effect?.type==='DROP_SHADOW'||effect?.type==='INNER_SHADOW')&&effect.color){const inset=effect.type==='INNER_SHADOW'?'inset ':'';const x=effect.offset?.x??0;const y=effect.offset?.y??0;const blur=effect.radius??0;const spread=effect.spread??0;out.css=`${inset}${px(x)} ${px(y)} ${px(blur)} ${px(spread)} ${cssColor(effect.color)}`;}return out;});
}

function safeRead(target:any,key:string):any{try{return jsonSafe(target[key]);}catch{return undefined;}}
function safeReadRaw(target:any,key:string):any{try{return target[key];}catch{return undefined;}}
function safeNodeReference(node:any):any{return node&&typeof node==='object'?compact({id:safeRead(node,'id'),type:safeRead(node,'type'),name:safeRead(node,'name')}):undefined;}
function compact(value:Record<string,any>):any{const out:any={};for(const [key,next] of Object.entries(value))if(next!==undefined)out[key]=next;return out;}
function px(value:any):string|undefined{return typeof value==='number'&&Number.isFinite(value)?`${Math.round(value*100)/100}px`:undefined;}
function axisAlignment(value:any):string|undefined{return value==='MIN'?'flex-start':value==='MAX'?'flex-end':value==='CENTER'?'center':value==='SPACE_BETWEEN'?'space-between':value==='BASELINE'?'baseline':undefined;}
function cssColor(color:any,paintOpacity?:any):string|undefined{if(!color||typeof color.r!=='number'||typeof color.g!=='number'||typeof color.b!=='number')return undefined;const r=Math.round(color.r*255);const g=Math.round(color.g*255);const b=Math.round(color.b*255);const alpha=Math.max(0,Math.min(1,(typeof color.a==='number'?color.a:1)*(typeof paintOpacity==='number'?paintOpacity:1)));if(alpha<0.999)return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha*1000)/1000})`;return `#${[r,g,b].map(value=>value.toString(16).padStart(2,'0')).join('').toUpperCase()}`;}
