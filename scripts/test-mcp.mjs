import { spawn } from 'node:child_process'

const p = spawn('node', ['mcp/server.mjs'], { stdio: ['pipe','pipe','pipe'] })
let buf = ''
const pending = new Map()
p.stdout.on('data', d => {
  buf += d
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i+1)
    if (!line.trim()) continue
    try { const msg = JSON.parse(line); if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) } } catch {}
  }
})
p.stderr.on('data', d => process.stderr.write('[mcp] ' + d))

let id = 0
const call = (method, params) => new Promise(res => {
  const myId = ++id
  pending.set(myId, res)
  p.stdin.write(JSON.stringify({ jsonrpc:'2.0', id: myId, method, params }) + '\n')
})

const init = await call('initialize', { protocolVersion:'2024-11-05', capabilities:{}, clientInfo:{name:'test',version:'1'} })
console.log('initialize   :', init.result?.serverInfo?.name, init.result?.protocolVersion)
p.stdin.write(JSON.stringify({ jsonrpc:'2.0', method:'notifications/initialized' })+'\n')

const tools = await call('tools/list', {})
console.log('tools        :', tools.result.tools.map(t=>t.name).join(', '))

const show = async (name, args) => {
  const r = await call('tools/call', { name, arguments: args })
  const text = r.result?.content?.[0]?.text ?? JSON.stringify(r.error)
  console.log(`\n--- ${name}(${JSON.stringify(args)})`)
  console.log(text.split('\n').slice(0, 12).join('\n'))
}

await show('list_systems', {})
await show('list_components', {})
await show('when_not_to_use', { name: 'Card' })
await show('check_code', { code: '<Button variant="cta" style={{color:"#ff0000"}}>Go</Button>\n<button>raw</button>' })
await show('find_component', { query: 'tag' })

const res = await call('resources/list', {})
console.log('\nresources    :', res.result.resources.map(r=>r.uri).slice(0,6).join('\n               '))
p.kill()
