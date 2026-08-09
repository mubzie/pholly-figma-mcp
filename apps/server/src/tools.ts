export interface ToolDefinition { name: string; description: string; inputSchema: Record<string, unknown> }
const fileKey = {type:'string', description:'Connected file key from list_files'};
const nodeId = {type:'string', description:'Figma node ID, for example 12:34'};
const parentId = {type:'string', description:'Parent Figma node ID'};
const componentId = {type:'string', description:'Component node ID'};
const object = {type:'object', properties:{}};
export const tools: ToolDefinition[] = [
  {name:'list_files',description:'List Figma files currently connected through the plugin.',inputSchema:object},
  {name:'get_metadata',description:'Get connected file metadata and current page.',inputSchema:{type:'object',properties:{fileKey}}},
  {name:'get_document',description:'Return the current page tree, serialized for AI context.',inputSchema:{type:'object',properties:{fileKey,depth:{type:'number'}}}},
  {name:'get_selection',description:'Return the current Figma selection with its nested design tree.',inputSchema:{type:'object',properties:{fileKey,depth:{type:'number',description:'Maximum child depth, defaults to 6'}}}},
  {name:'inspect_selection',description:'Primary design-to-code tool. Return a detailed textual UI specification for the selected Figma node (or nodeId) plus an optional native PNG/JPG screenshot. Works for agents with or without image vision.',inputSchema:{type:'object',properties:{fileKey,nodeId,depth:{type:'number',minimum:0,maximum:12,description:'Maximum child depth, defaults to 8'},includeHidden:{type:'boolean',description:'Include hidden layers and copy, defaults to false'},includeScreenshot:{type:'boolean',description:'Attach a native MCP image, defaults to true'},format:{type:'string',enum:['PNG','JPG'],description:'Screenshot format, defaults to PNG'},scale:{type:'number',minimum:0.1,maximum:4,description:'Screenshot scale, defaults to 1'},vectorMaxSize:{type:'number',minimum:16,maximum:4096,description:'Maximum width/height for automatic vector asset candidates, defaults to 512'}}}},
  {name:'export_selection_assets',description:'Export exact raster fills and vector/icon candidates from the selected Figma node into a safe project-relative directory. Returns written asset paths for direct use in the implementation.',inputSchema:{type:'object',properties:{fileKey,nodeId,outputDir:{type:'string',description:'Project-relative output directory, defaults to public/figma-assets'},includeHidden:{type:'boolean',description:'Include hidden layers, defaults to false'},includeRaster:{type:'boolean',description:'Export original raster fills, defaults to true'},includeVectors:{type:'boolean',description:'Export vector/icon candidates as SVG, defaults to true'},vectorMaxSize:{type:'number',minimum:16,maximum:4096,description:'Maximum width/height for automatic vector asset candidates, defaults to 512'}}}},
  {name:'get_node',description:'Return a serialized Figma node by ID.',inputSchema:{type:'object',properties:{fileKey,nodeId},required:['nodeId']}},
  {name:'get_design_context',description:'Return a compact, depth-limited design tree.',inputSchema:{type:'object',properties:{fileKey,nodeId,depth:{type:'number'}}}},
  {name:'get_styles',description:'Return local paint, text, effect, and grid styles.',inputSchema:{type:'object',properties:{fileKey}}},
  {name:'get_variable_defs',description:'Return local variable collections and values.',inputSchema:{type:'object',properties:{fileKey}}},
  {name:'create_variable_collection',description:'Create a local variable collection.',inputSchema:{type:'object',properties:{fileKey,name:{type:'string'}},required:['name']}},
  {name:'create_variable',description:'Create a variable in a local collection and optionally set mode values.',inputSchema:{type:'object',properties:{fileKey,collectionId:{type:'string'},name:{type:'string'},resolvedType:{type:'string',enum:['BOOLEAN','COLOR','FLOAT','STRING']},valuesByMode:{type:'object'}},required:['collectionId','name','resolvedType']}},
  {name:'set_variable_values',description:'Set variable values by mode.',inputSchema:{type:'object',properties:{fileKey,variableId:{type:'string'},valuesByMode:{type:'object'}},required:['variableId','valuesByMode']}},
  {name:'bind_variable',description:'Bind or unbind a variable on a node property.',inputSchema:{type:'object',properties:{fileKey,nodeId,field:{type:'string'},variableId:{type:['string','null']}},required:['nodeId','field']}},
  {name:'create_component',description:'Convert a frame or node into a component.',inputSchema:{type:'object',properties:{fileKey,nodeId,name:{type:'string'}},required:['nodeId']}},
  {name:'create_instance',description:'Create an instance of a component.',inputSchema:{type:'object',properties:{fileKey,componentId,parentId},required:['componentId']}},
  {name:'set_instance_properties',description:'Set component property values on an instance.',inputSchema:{type:'object',properties:{fileKey,nodeId,properties:{type:'object'}},required:['nodeId','properties']}},
  {name:'swap_instance_component',description:'Swap an instance to another component.',inputSchema:{type:'object',properties:{fileKey,nodeId,componentId},required:['nodeId','componentId']}},
  {name:'detach_instance',description:'Detach an instance from its component.',inputSchema:{type:'object',properties:{fileKey,nodeId},required:['nodeId']}},
  {name:'batch',description:'Run multiple non-destructive bridge operations in sequence and return each result.',inputSchema:{type:'object',properties:{fileKey,operations:{type:'array',items:{type:'object'}}},required:['operations']}},
  {name:'commit_undo',description:'Commit the current plugin changes as one undo step.',inputSchema:{type:'object',properties:{fileKey}}},
  {name:'get_screenshot',description:'Export a node. PNG, JPG, and SVG are returned as native MCP image content; PDF remains encoded data.',inputSchema:{type:'object',properties:{fileKey,nodeId,format:{type:'string',enum:['PNG','JPG','SVG','PDF']},scale:{type:'number'}},required:['nodeId']}},
  {name:'set_node_properties',description:'Patch common node properties.',inputSchema:{type:'object',properties:{fileKey,nodeId,properties:{type:'object'}},required:['nodeId','properties']}},
  {name:'set_text_content',description:'Replace a text node contents.',inputSchema:{type:'object',properties:{fileKey,nodeId,text:{type:'string'}},required:['nodeId','text']}},
  {name:'set_text_properties',description:'Patch text font, size, alignment, color, and bounds.',inputSchema:{type:'object',properties:{fileKey,nodeId,properties:{type:'object'}},required:['nodeId','properties']}},
  {name:'set_solid_fill',description:'Set a solid fill or stroke.',inputSchema:{type:'object',properties:{fileKey,nodeId,paint:{type:'object'},target:{type:'string',enum:['fills','strokes']}},required:['nodeId','paint']}},
  {name:'set_auto_layout',description:'Configure auto-layout properties.',inputSchema:{type:'object',properties:{fileKey,nodeId,layout:{type:'object'}},required:['nodeId','layout']}},
  {name:'set_selection',description:'Set the current page selection.',inputSchema:{type:'object',properties:{fileKey,nodeIds:{type:'array',items:{type:'string'}}},required:['nodeIds']}},
  {name:'scroll_and_zoom_into_view',description:'Frame the viewport around nodes.',inputSchema:{type:'object',properties:{fileKey,nodeIds:{type:'array',items:{type:'string'}}},required:['nodeIds']}},
  {name:'create_frame',description:'Create a frame, optionally under a parent.',inputSchema:{type:'object',properties:{fileKey,parentId,node:{type:'object'}},required:['node']}},
  {name:'create_text',description:'Create a text node.',inputSchema:{type:'object',properties:{fileKey,parentId,node:{type:'object'}},required:['node']}},
  {name:'create_shape',description:'Create a rectangle, ellipse, or line.',inputSchema:{type:'object',properties:{fileKey,parentId,node:{type:'object'}},required:['node']}},
  {name:'create_image',description:'Create an image-backed rectangle from a URL or data URI.',inputSchema:{type:'object',properties:{fileKey,parentId,src:{type:'string'},node:{type:'object'}},required:['src']}},
  {name:'duplicate_nodes',description:'Duplicate nodes in place.',inputSchema:{type:'object',properties:{fileKey,nodeIds:{type:'array'}},required:['nodeIds']}},
  {name:'reparent_nodes',description:'Move nodes into another parent.',inputSchema:{type:'object',properties:{fileKey,nodeIds:{type:'array'},parentId},required:['nodeIds','parentId']}},
  {name:'group_nodes',description:'Group sibling nodes.',inputSchema:{type:'object',properties:{fileKey,nodeIds:{type:'array'},parentId,name:{type:'string'}},required:['nodeIds']}},
  {name:'ungroup_node',description:'Ungroup a group or frame and move children to its parent.',inputSchema:{type:'object',properties:{fileKey,nodeId},required:['nodeId']}},
  {name:'validate_design',description:'Validate a declarative design tree without modifying Figma.',inputSchema:{type:'object',properties:{fileKey,tree:{type:'object'}},required:['tree']}},
  {name:'render_design',description:'Create or update a complete declarative design tree. Use stable key values for reconciliation.',inputSchema:{type:'object',properties:{fileKey,parentId,tree:{type:'object'},mode:{type:'string',enum:['append','reconcile']},commitUndo:{type:'boolean'}},required:['tree']}},
  {name:'delete_nodes',description:'Delete nodes. Requires explicit confirm=true.',inputSchema:{type:'object',properties:{fileKey,nodeIds:{type:'array'},confirm:{type:'boolean'}},required:['nodeIds','confirm']}}
];
