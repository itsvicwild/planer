// Non-destructive JSON import for Wild Workspace.
// Loaded after the main application script so it can use the app's existing data model.
let PENDING_ADDITIVE_IMPORT = null;

function additiveImportName(value){return String(value??"").trim().replace(/\s+/g," ").toLocaleLowerCase("ru-RU")}
function mergeHabitHistoryForAdditiveImport(current,imported){
 const local=normalizeHabitRecord(deepCloneData(current)),incoming=normalizeHabitRecord(deepCloneData(imported)),logOps={...local.logOps},legacyCounts={...local.legacyCounts};let changed=false;
 for(const [date,op] of Object.entries(incoming.logOps)){const old=logOps[date];if(!old||parseSyncTimestamp(op.updatedAt)>parseSyncTimestamp(old.updatedAt)){if(!old||old.done!==op.done||old.updatedAt!==op.updatedAt)changed=true;logOps[date]=op}}
 for(const [week,count] of Object.entries(incoming.legacyCounts)){if((legacyCounts[week]||0)<count){legacyCounts[week]=count;changed=true}}
 return {record:changed?normalizeHabitRecord({...local,log:[],logOps,legacyCounts,updatedAt:new Date().toISOString()}):local,changed}
}
function buildAdditiveImportPlan(source){
 if(!source||typeof source!=="object"||Array.isArray(source))throw new Error("Файл не содержит резервную копию Wild Workspace.");
 const payload=migrateWorkspacePayload(source),recognized=["T","E","HD","H","BL","LIB_BOOKS","LIB_SHELVES"].some(k=>Array.isArray(payload[k])||(k==="BL"&&payload[k]&&typeof payload[k]==="object"&&!Array.isArray(payload[k])));
 if(!recognized)throw new Error("В JSON не найдены поддерживаемые данные Wild Workspace.");
 const now=new Date().toISOString(),newBlocks={},blockMap=new Map(),usedBlockIds=new Set(Object.keys(BL||{})),newShelves=[],shelfMap=new Map(),usedShelfIds=new Set((LIB_SHELVES||[]).map(item=>String(item?.id)));let nextOrder=orderedBlockEntries().length,nextShelfOrder=orderedLibraryShelfEntries().length;
  const findShelfByName=name=>{const target=additiveImportName(name);if(!target)return null;return [...(LIB_SHELVES||[]),...newShelves].find(shelf=>additiveImportName(shelf?.title)===target)||null};
  const freshShelfId=()=>{let id;do{id="import-shelf-"+nid()}while(usedShelfIds.has(id));usedShelfIds.add(id);return id};
  for(const rawShelf of Array.isArray(payload.LIB_SHELVES)?payload.LIB_SHELVES:[]){const incoming=sanitizeLibraryShelf(rawShelf);if(!incoming||shelfMap.has(incoming.id))continue;const sameId=(LIB_SHELVES||[]).find(shelf=>shelf.id===incoming.id);if(sameId){shelfMap.set(incoming.id,sameId.id);continue}const sameName=findShelfByName(incoming.title);if(sameName){shelfMap.set(incoming.id,sameName.id);continue}let id=incoming.id;if(usedShelfIds.has(id))id=freshShelfId();else usedShelfIds.add(id);const shelf=sanitizeLibraryShelf({...incoming,id,order:nextShelfOrder++,systemDefault:false,updatedAt:now});if(shelf){newShelves.push(shelf);shelfMap.set(incoming.id,id)}}
 const findBlockByName=name=>{const target=additiveImportName(name);if(!target)return "";for(const [id,b] of [...Object.entries(BL||{}),...Object.entries(newBlocks)])if(additiveImportName(b?.n)===target)return id;return ""};
 const freshId=prefix=>{let id;do{id=prefix+"-"+nid()}while(usedBlockIds.has(id));usedBlockIds.add(id);return id};
 for(const [rawId,rawBlock] of Object.entries(payload.BL&&typeof payload.BL==="object"?payload.BL:{})){
  const sourceId=safeRecordId(rawId);if(!sourceId||!rawBlock||typeof rawBlock!=="object")continue;
  if(Object.prototype.hasOwnProperty.call(BL,sourceId)){blockMap.set(sourceId,sourceId);continue}
  const sameName=findBlockByName(rawBlock.n);if(sameName){blockMap.set(sourceId,sameName);continue}
  let id=sourceId;if(usedBlockIds.has(id))id=freshId("import-block");else usedBlockIds.add(id);
  const block=sanitizeBlock(id,{...deepCloneData(rawBlock),systemDefault:false,sortOrder:nextOrder++,orderUpdatedAt:now,updatedAt:now});block.systemDefault=false;newBlocks[id]=block;blockMap.set(sourceId,id);
 }
 let fallbackBlockId="";
 const resolveTaskBlock=rawId=>{
  const key=safeRecordId(rawId);
  if(key&&blockMap.has(key))return blockMap.get(key);
  if(key&&Object.prototype.hasOwnProperty.call(BL,key))return key;
  if(key&&Object.prototype.hasOwnProperty.call(newBlocks,key))return key;
  const first=orderedBlockEntries()[0]?.[0]||Object.keys(newBlocks)[0];if(first)return first;
  if(!fallbackBlockId){fallbackBlockId=freshId("import-block");newBlocks[fallbackBlockId]=sanitizeBlock(fallbackBlockId,{n:"Импортировано",c:BLOCK_PALETTE[0],systemDefault:false,sortOrder:nextOrder++,orderUpdatedAt:now,updatedAt:now});newBlocks[fallbackBlockId].systemDefault=false}
  return fallbackBlockId;
 };
 const taskIds=new Set((Array.isArray(T)?T:[]).map(x=>String(x?.id))),tasks=[];let skippedTasks=0;
 for(const raw of Array.isArray(payload.T)?payload.T:[]){
  const id=safeRecordId(raw?.id);if(!id||taskIds.has(id)){skippedTasks++;continue}
  const blockId=resolveTaskBlock(raw.b),fallback=orderedBlockEntries()[0]?.[0]||"study";
  const task=sanitizeTask({...deepCloneData(raw),id,b:Object.prototype.hasOwnProperty.call(BL,blockId)?blockId:fallback});
  if(!task){skippedTasks++;continue}task.b=blockId;tasks.push(task);taskIds.add(id);
 }
 const eventIds=new Set((Array.isArray(E)?E:[]).map(x=>String(x?.id))),events=[];let skippedEvents=0;
 for(const raw of Array.isArray(payload.E)?payload.E:[]){const id=safeRecordId(raw?.id);if(!id||eventIds.has(id)){skippedEvents++;continue}const event=sanitizeEvent({...deepCloneData(raw),id});if(!event){skippedEvents++;continue}events.push(event);eventIds.add(id)}
 const holidayIds=new Set((Array.isArray(HD)?HD:[]).map(x=>String(x?.id))),holidays=[];let skippedHolidays=0;
 for(const raw of Array.isArray(payload.HD)?payload.HD:[]){const id=safeRecordId(raw?.id);if(!id||holidayIds.has(id)){skippedHolidays++;continue}const holiday=sanitizeHoliday({...deepCloneData(raw),id});if(!holiday){skippedHolidays++;continue}holidays.push(holiday);holidayIds.add(id)}
 const habitById=new Map((Array.isArray(H)?H:[]).map((h,index)=>[String(h?.id),{kind:"existing",index,record:h}])),habits=[],habitUpdates=new Map();let skippedHabits=0;
 for(const raw of Array.isArray(payload.H)?payload.H:[]){
  const id=safeRecordId(raw?.id);if(!id){skippedHabits++;continue}
  const imported=sanitizeHabit({...deepCloneData(raw),id});if(!imported){skippedHabits++;continue}
  const current=habitById.get(id);
  if(current){const merged=mergeHabitHistoryForAdditiveImport(current.kind==="existing"?(habitUpdates.get(id)||H[current.index]):current.record,imported);if(merged.changed){if(current.kind==="existing")habitUpdates.set(id,merged.record);else{current.record=merged.record;const at=habits.findIndex(x=>String(x.id)===id);if(at>=0)habits[at]=merged.record}}continue}
  habits.push(imported);habitById.set(id,{kind:"new",record:imported});
 }
 const bookIds=new Set((Array.isArray(LIB_BOOKS)?LIB_BOOKS:[]).map(x=>String(x?.id))),bookKeys=new Set((Array.isArray(LIB_BOOKS)?LIB_BOOKS:[]).map(x=>additiveImportName(x?.title)+"|"+String(x?.url||"").trim().toLowerCase())),books=[];let skippedBooks=0;
 for(const raw of Array.isArray(payload.LIB_BOOKS)?payload.LIB_BOOKS:[]){
  const id=safeRecordId(raw?.id);if(!id||bookIds.has(id)){skippedBooks++;continue}
  const shelfRaw=raw?.shelf,sourceShelf=shelfRaw==="uncategorized"?"uncategorized":safeRecordId(shelfRaw),shelf=sourceShelf==="uncategorized"?"uncategorized":(shelfMap.get(sourceShelf)||(libraryHasShelf(sourceShelf)?sourceShelf:"uncategorized"));
  const book=sanitizeLibraryBook({...deepCloneData(raw),id,shelf});if(!book){skippedBooks++;continue}
  const key=additiveImportName(book.title)+"|"+String(book.url||"").trim().toLowerCase();if(bookKeys.has(key)){skippedBooks++;continue}
  books.push(book);bookIds.add(id);bookKeys.add(key);
 }
 const counts={blocks:Object.keys(newBlocks).length,shelves:newShelves.length,tasks:tasks.length,events:events.length,holidays:holidays.length,habits:habits.length,habitHistory:habitUpdates.size,books:books.length};
 counts.total=Object.values(counts).reduce((sum,n)=>sum+n,0);
 return {blocks:newBlocks,shelves:newShelves,tasks,events,holidays,habits,habitUpdates:[...habitUpdates.entries()].map(([id,record])=>({id,record})),books,counts,skipped:{tasks:skippedTasks,events:skippedEvents,holidays:skippedHolidays,habits:skippedHabits,books:skippedBooks}};
}
function openAdditiveImportPreview(fileName,source,plan){
 PENDING_ADDITIVE_IMPORT={fileName,source};
 const labels=[["Новые блоки",plan.counts.blocks],["Новые полки библиотеки",plan.counts.shelves],["Новые задачи",plan.counts.tasks],["Новые мероприятия",plan.counts.events],["Новые праздники",plan.counts.holidays],["Новые привычки",plan.counts.habits],["Дополненная история привычек",plan.counts.habitHistory],["Новые книги и ссылки",plan.counts.books]];
 const rows=labels.map(([label,count])=>'<div class="ics-preview-row"><b>'+esc(label)+'</b><small>'+count+'</small></div>').join("");
 const skipped=Object.values(plan.skipped).reduce((sum,n)=>sum+n,0);
 const hint="Текущие записи и настройки останутся без изменений. Совпадающие ID будут пропущены"+(skipped?"; пропущено совпадений или некорректных записей: "+skipped:"")+". История привычек будет дополнена новыми отметками.";
 openM('<div class="modal-eyebrow"><span class="i">merge</span> ДОБАВЛЕНИЕ ДАННЫХ</div><h3>Объединить резервную копию?</h3><p class="modal-hint">'+esc(fileName)+' · новых элементов: '+plan.counts.total+'</p><div class="ics-preview-list">'+rows+'</div><p class="modal-hint">'+esc(hint)+'</p><p class="modal-hint">Настройки, история удалений и служебные данные из файла не импортируются.</p><div class="act"><button type="button" class="btn n o" data-add-json-cancel>Отмена</button><button type="button" class="btn n" data-add-json-confirm '+(plan.counts.total?"":"disabled")+'>'+(plan.counts.total?"Добавить новые данные":"Новых данных нет")+'</button></div>');
}
function applyPendingAdditiveImport(){
 if(!PENDING_ADDITIVE_IMPORT)return;
 const pending=PENDING_ADDITIVE_IMPORT;let plan;
 try{plan=buildAdditiveImportPlan(pending.source)}catch(err){PENDING_ADDITIVE_IMPORT=null;closeM();toast(err?.message||"Не удалось подготовить импорт");return}
 if(!plan.counts.total){PENDING_ADDITIVE_IMPORT=null;closeM();toast("Новых данных для добавления нет");return}
 const before={T:deepCloneData(T),E:deepCloneData(E),HD:deepCloneData(HD),H:deepCloneData(H),BL:deepCloneData(BL),LIB_BOOKS:deepCloneData(LIB_BOOKS),LIB_SHELVES:deepCloneData(LIB_SHELVES)};
 try{
  BL={...BL,...plan.blocks};LIB_SHELVES.push(...plan.shelves);T.push(...plan.tasks);E.push(...plan.events);HD.push(...plan.holidays);H.push(...plan.habits);
  for(const update of plan.habitUpdates){const index=H.findIndex(x=>String(x.id)===String(update.id));if(index>=0)H[index]=update.record}
  LIB_BOOKS.push(...plan.books);sanitizeWorkspaceRecords();
  if(!save())throw new Error("Не удалось сохранить данные. Текущая информация восстановлена.");
 }catch(err){
  T=before.T;E=before.E;HD=before.HD;H=before.H;BL=before.BL;LIB_BOOKS=before.LIB_BOOKS;LIB_SHELVES=before.LIB_SHELVES;sanitizeWorkspaceRecords();all();PENDING_ADDITIVE_IMPORT=null;closeM();toast(err?.message||"Импорт не выполнен; текущие данные не изменены.");return;
 }
 PENDING_ADDITIVE_IMPORT=null;closeM();all();
 const total=plan.counts.total,summary="Добавлено из JSON: "+plan.counts.tasks+" задач, "+plan.counts.events+" мероприятий, "+plan.counts.blocks+" блоков, "+plan.counts.shelves+" полок, "+plan.counts.habits+" привычек, "+plan.counts.books+" книг";
 recordActivity("import",summary);toast("Добавлено новых элементов: "+total);
}

document.addEventListener("change",e=>{
 const input=e.target;if(input?.id!=="impMerge"||!input.files?.[0])return;
 const file=input.files[0];input.value="";
 if(file.size>10*1024*1024){toast("JSON-файл больше 10 МБ.");return}
 const reader=new FileReader();
 reader.onload=()=>{try{const source=JSON.parse(String(reader.result||""));const plan=buildAdditiveImportPlan(source);openAdditiveImportPreview(file.name,source,plan)}catch(err){PENDING_ADDITIVE_IMPORT=null;toast(err?.message||"Не удалось прочитать JSON-файл")}};
 reader.onerror=()=>toast("Не удалось прочитать JSON-файл");
 reader.readAsText(file);
});
document.addEventListener("click",e=>{
 if(e.target.closest("[data-add-json-cancel]")){PENDING_ADDITIVE_IMPORT=null;closeM();return}
 if(e.target.closest("[data-add-json-confirm]")){applyPendingAdditiveImport();return}
});
