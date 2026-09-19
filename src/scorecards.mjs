import {z} from 'zod';
const cell=z.union([z.number().int().min(-5).max(30),z.null()]);
const schema=z.object({notation:z.enum(['strokes','relative','unknown']),players:z.array(z.object({name:z.string().min(1).max(140),scores:z.array(cell).length(18)}).strict()).min(1).max(16)}).strict();
export function validateReading(value){
 const result=schema.parse(value);
 if(result.notation==='strokes'&&result.players.some(p=>p.scores.some(s=>s!==null&&s<1)))throw new Error('A stroke count must be positive. Unknown cells must be null.');
 return result;
}
export function convertScores(scores,notation,pars){
 if(!['strokes','relative'].includes(notation))throw new Error('Choose and confirm the score notation.');
 if(scores.length!==18||pars.length!==18)throw new Error('A scorecard needs exactly eighteen cells.');
 return scores.map((score,i)=>{if(score===null||score==='')return '';if(typeof score!=='number'||!Number.isInteger(score))throw new Error('Use whole-number scores or leave the cell blank.');const strokes=notation==='relative'?score+pars[i]:score;if(strokes<1||strokes>30)throw new Error('A converted score must be from 1 to 30.');return String(strokes);});
}
