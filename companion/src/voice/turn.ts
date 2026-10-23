import type {Turn} from '../contracts.js';
export class TurnManager {
 private current?:AbortController;private id=0;
 start(external?:number):Turn {this.current?.abort();this.current=new AbortController();this.id=external===undefined?this.id+1:Math.max(this.id+1,external);return {id:this.id,signal:this.current.signal};}
 cancel(){this.current?.abort();}
 get number(){return this.id;}
 isCurrent(turn:Turn){return turn.id===this.id&&!turn.signal.aborted;}
}
