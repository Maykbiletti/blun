var cp = require('child_process');
var redis = require('./redis');
var nl2 = String.fromCharCode(10)+String.fromCharCode(10);

async function callClaudeCLIStream(agentId, messages) {
  var sys = messages.find(function(m){ return m.role==='system'; });
  var usr = messages.filter(function(m){ return m.role!=='system'; })
    .map(function(m){ return m.role+': '+m.content; }).join(nl2);
  var prompt = (sys ? 'Context: '+sys.content+nl2 : '')+usr;
  return new Promise(function(resolve,reject){
    var proc=cp.spawn('claude',['--print','--output-format=stream-json','--include-partial-messages'],{env:process.env,cwd:'/tmp',stdio:['pipe','pipe','pipe']});
    var full='',buf='';
    proc.stdout.on('data',function(d){
      buf+=d.toString();
      var lines=buf.split(String.fromCharCode(10));buf=lines.pop();
      lines.forEach(function(line){
        if(!line.trim())return;
        try{
          var c=JSON.parse(line);
          var t=(c.type==='text'&&c.text)||(c.type==='assistant'&&c.message&&c.message.content&&c.message.content[0]&&c.message.content[0].text)||'';
          if(t){full+=t;redis.broadcast('agent:stream',{agentId:agentId,tok:t});}
        }catch(e){}
      });
    });
    proc.on('close',function(code){
      redis.broadcast('agent:stream:end',{agentId:agentId});
      if(full.trim())resolve({content:full.trim(),tokens:0,cost:0});
      else reject(new Error('stream exit:'+code));
    });
    setTimeout(function(){proc.kill();reject(new Error('timeout'));},90000);
    proc.stdin.write(prompt);proc.stdin.end();
  });
}
module.exports={callClaudeCLIStream};
