-- @description Cool Reaper Script Manager
-- @version 3.16.0
-- @author bryan
-- @about
--   Installs, updates and licenses Cool Reaper Scripts (Vertical FX List, FX Devices, its plugins and
--   the free Prism EQ) from coolreaperscripts.com. Shows what's installed, what's newer, and which scripts
--   you own, with a Buy button for the ones you don't. Run it any time to update.
-- @changelog
--   3.16.0: connections that fail are written down (the last 50, never your keys, email or files)
--          and sent to coolreaperscripts.com once a day so they can be fixed; switch it off at the
--          bottom of the window. Copy diagnostics puts them on the clipboard for a support email.
--   3.15.0: a slow or dead internet connection never freezes REAPER: every download and request to
--          the site runs in the background (on Windows without any window), the window keeps
--          drawing while it waits, and a connection that can't be made gives up after 4 seconds.
--          Works with Windows user names that have non-ASCII letters.
--   3.14.0: Prism EQ installs as a VST3 too, next to the CLAP: one card, both formats, updated
--          together. The VST3 goes in your VST3 folder (macOS ~/Library/Audio/Plug-Ins/VST3; Windows
--          Common Files\VST3, or your own AppData VST3 folder when that one needs admin rights).
--   3.13.0: plugins: Prism EQ is now a CLAP plugin with its own window (still free, no sign-in), and the
--          JSFX version is discontinued: installing the plugin removes the old JSFX. FX Devices'
--          Waveshaper plugin installs with your FX Devices license or trial. Plugins go in your CLAP
--          folder and have their own section.
--   3.12.1: the update check gives up after a few seconds on a slow or dead connection instead of
--          holding the window.
--   3.12.0: the Script Manager updates itself: when a newer one is out, a button at the top installs
--          it and reopens the window. JSFX are a grid of cards, each with a picture of its FX
--          Devices device. The window is at most 700 px wide.
--   3.11.0: installing FX Devices no longer brings every FX Devices effect along: each JSFX (Patina,
--          Note Echo, Step Engine...) is its own item in the JSFX section, installed with your FX Devices
--          license or trial. The ones you already have keep updating with FX Devices. The Scripts and
--          JSFX sections each have an Install all button.
--   3.10.0: Prism EQ, the free 16-band EQ, installs and updates here too, no sign-in needed. It goes
--          where FX Devices puts it, so with both you still see one Prism EQ in the FX browser. A copy
--          that's already there is kept when it's current and updated when it's older, and a second
--          copy from the website download can be deleted from here. JSFX have their own section,
--          with smaller cards that show a preview of each one's window.
--   3.9.0: an update no longer replaces layouts you changed without asking: keep yours or use the new
--          one, file by file. FX Devices' LFO and envelope shapes are never replaced.
--   3.8.1: Windows: no long freeze while downloading (8 files per step instead of 32).
--   3.8.0: faster installs and updates: 8 downloads at a time, and an update only downloads the
--          files that changed since the installed version.
--   3.7.0: after an install, shows the folders it went to (script, and FX Devices' JSFX in
--          Effects) with a button to open each in Finder / Explorer, and the action's name.
--   3.6.0: shows until when your license gets updates (2 years per purchase). Newer versions are
--          marked "renew to get it" and a Renew button appears; Update picks the newest version
--          your license includes.
--   3.5.0: FX Devices: skips the layout backgrounds of plugins you don't have (a smaller, quicker
--          download); FX Devices fetches one if you get that plugin later.
--   3.4.0: a progress window while the free extensions download (no frozen REAPER on macOS;
--          on Windows it moves file by file).
--   3.3.2: Windows: sign-in no longer opens a console window or taskbar button at all.
--   3.3.1: installs ReaImGui with its Lua files (imgui.lua), so one restart is enough; fixes a
--          ReaImGui the 3.3.0 setup left without them. Windows: no console window flashing
--          while you sign in. "Sign in / free trial" is a full button.
--   3.3.0: without ReaImGui the Manager no longer stops with an error: it lists the missing
--          extensions and installs them in one click, says when only a restart is needed, and
--          points to ReaPack when a download fails. Flags a ReaImGui too old for Vertical FX List.
--   3.2.0: "Sign in with browser" replaces the key box and the email trial (the same sign-in the
--          scripts use, and it activates this computer for the script too). Run from Downloads,
--          the Manager moves itself into REAPER's Scripts folder and its Actions list.
--   3.1.0: every download needs a license or a free trial (released versions too).
--   3.0.0: now the Cool Reaper Script Manager: one window for every script, update buttons,
--          a license key or free trial per script, Buy buttons, FX Devices, the Monolith look.
--   2.0.0: downloads from coolreaperscripts.com (no key needed for released versions), new window,
--          dependency check, version picker, fills in your license for the installed scripts.

local r = reaper

local VERSION = '3.16.0'
local SITE = 'https://www.coolreaperscripts.com'
local API = SITE .. '/api/scripts'
local VERIFY_URL = SITE .. '/api/license/verify'
local LINK_URL = SITE .. '/api/license/info'
local FONT_URL = SITE .. '/assets/Fonts/'
-- kept from the 2.0 installer: the scripts read what was installed from this section
local EXT = 'CoolReaperScripts_Installer'
-- tells the site what this client can do: 3 = files outside the script's folder (FX Devices' JSFX),
-- 4 = free products that need no license (Prism EQ), 5 = FX Devices' JSFX as their own items,
-- 6 = CLAP plugins, per platform (in the CLAP folder: '{CLAP}/' in a product's paths),
-- 7 = a plugin's VST3 with its CLAP (in the VST3 folder: '{VST3}/')
local CLIENT = 7
local TITLE = 'Cool Reaper Script Manager'
-- where the Manager keeps itself (next to Vertical FX List), relative to REAPER's resource folder
local MANAGER_DIR = 'Scripts/CoolReaperScripts'
local MANAGER_FILE = 'Cool Reaper Script Manager.lua'

local OS = r.GetOS()
local IS_WIN = OS:match('Win') ~= nil
local SEP = IS_WIN and '\\' or '/'
local RES = r.GetResourcePath()
local IS_MAC = OS:match('OSX') ~= nil or OS:match('macOS') ~= nil

-- which build of the plugins this computer takes (the site only offers a plugin that has one), and
-- the user's CLAP folder, which REAPER scans: macOS ~/Library/Audio/Plug-Ins/CLAP, Windows
-- %LOCALAPPDATA%\Programs\Common\CLAP (no admin rights needed), Linux ~/.clap
local PLATFORM = IS_MAC and 'mac' or IS_WIN and (OS == 'Win32' and 'win32' or 'win64') or 'linux'
local function ClapDir()
  if IS_WIN then
    local la = os.getenv('LOCALAPPDATA')
    if not la or la == '' then la = (os.getenv('USERPROFILE') or '') .. '\\AppData\\Local' end
    return la .. '\\Programs\\Common\\CLAP'
  end
  local home = os.getenv('HOME') or ''
  return IS_MAC and (home .. '/Library/Audio/Plug-Ins/CLAP') or (home .. '/.clap')
end

-- the user's VST3 folder: macOS ~/Library/Audio/Plug-Ins/VST3, Linux ~/.vst3; Windows
-- %COMMONPROGRAMFILES%\VST3, which REAPER scans by default, when it can be written to (it needs admin
-- rights unless REAPER runs as admin, or a plugin installer opened it up), else
-- %LOCALAPPDATA%\Programs\Common\VST3, which REAPER only scans once it's in its VST paths
-- (VST3.needsPath). A VST3 already in one of them stays where it is. (One table: the main chunk is
-- at Lua's 200 locals.)
local VST3 = { needsPath = false }
function VST3.Dir()
  if VST3.dir then return VST3.dir end
  if not IS_WIN then
    local home = os.getenv('HOME') or ''
    VST3.dir = IS_MAC and (home .. '/Library/Audio/Plug-Ins/VST3') or (home .. '/.vst3')
    return VST3.dir
  end
  local cf = os.getenv('COMMONPROGRAMFILES')
  if not cf or cf == '' then cf = (os.getenv('ProgramFiles') or 'C:\\Program Files') .. '\\Common Files' end
  local common = cf .. '\\VST3'
  local la = os.getenv('LOCALAPPDATA')
  if not la or la == '' then la = (os.getenv('USERPROFILE') or '') .. '\\AppData\\Local' end
  local user = la .. '\\Programs\\Common\\VST3'
  local function has(dir) local f = io.open(dir .. '\\FXD Prism EQ.vst3\\Contents\\x86_64-win\\FXD Prism EQ.vst3', 'rb') if f then f:close() return true end end
  local function writable(dir)
    r.RecursiveCreateDirectory(dir, 0)
    local t = dir .. '\\.crs_write_test'
    local f = io.open(t, 'wb')
    if not f then return false end
    f:close() os.remove(t)
    return true
  end
  if has(user) and not has(common) then VST3.dir, VST3.needsPath = user, true
  elseif writable(common) then VST3.dir = common
  else VST3.dir, VST3.needsPath = user, true end
  return VST3.dir
end

---------------------------------------------------------------------------------------------------
-- Opening links
---------------------------------------------------------------------------------------------------

local function OpenUrl(url)
  if r.CF_ShellExecute then r.CF_ShellExecute(url) return end
  -- explorer hands the link to the browser: no console window, and REAPER doesn't wait for it
  if IS_WIN then r.ExecProcess('explorer.exe "' .. url .. '"', -1)
  elseif OS:match('OSX') or OS:match('macOS') then os.execute('open "' .. url .. '"')
  else os.execute('xdg-open "' .. url .. '"') end
end

local REVEAL_LABEL = IS_WIN and 'Show in Explorer' or IS_MAC and 'Show in Finder' or 'Open folder'

-- opens a folder in Finder / Explorer / the file manager
local function RevealFolder(dir)
  if r.CF_ShellExecute then r.CF_ShellExecute(dir) return end
  if IS_WIN then r.ExecProcess('explorer.exe "' .. dir .. '"', -1)
  elseif IS_MAC then os.execute("open '" .. dir:gsub("'", "'\\''") .. "'")
  else os.execute("xdg-open '" .. dir:gsub("'", "'\\''") .. "'") end
end


---------------------------------------------------------------------------------------------------
-- Files and processes
---------------------------------------------------------------------------------------------------

local function TempDir()
  local d = IS_WIN and (os.getenv('TEMP') or os.getenv('TMP')) or os.getenv('TMPDIR')
  if not d or d == '' then d = RES end
  -- os.getenv gives Windows' ANSI spelling of a user folder with non-ASCII letters ("T?st"), which
  -- REAPER's UTF-8 io.open can't open: a folder in REAPER's own (UTF-8) resource path then
  if IS_WIN and (d:find('[\128-\255]') or d:find('?', 1, true)) then
    d = RES .. '\\Scripts\\CoolReaperScripts\\Script Manager\\Temp'
    r.RecursiveCreateDirectory(d, 0)
  end
  return (d:gsub('[/\\]+$', ''))
end

local nonce = 0
local function TempFile(name)
  nonce = nonce + 1
  return TempDir() .. SEP .. string.format('crs_%x%x_%d_%s', os.time() % 0xFFFFFF, math.floor(os.clock() * 1e6) % 0xFFFFFF, nonce, name)
end

local function ShellQuote(s) return "'" .. tostring(s):gsub("'", "'\\''") .. "'" end

local function ReadFile(p)
  local f = io.open(p, 'rb')
  if not f then return nil end
  local d = f:read('*a')
  f:close()
  return d
end

local function WriteFile(p, data)
  local f = io.open(p, 'wb')
  if not f then return false end
  f:write(data)
  f:close()
  return true
end

local function Exists(p)
  local f = io.open(p, 'rb')
  if f then f:close() return true end
  return false
end

local function DirOf(p) return p:match('^(.*)[/\\][^/\\]*$') end

local function NativePath(p) return (p:gsub('/', SEP)) end
-- a product's path (relative to REAPER's resource folder, or '{CLAP}/...' / '{VST3}/...' for the
-- plugin folders) on disk
local function ResPath(rel)
  local clap = rel:match('^{CLAP}/?(.*)$')
  if clap then return NativePath(ClapDir() .. (clap ~= '' and ('/' .. clap) or '')) end
  local vst3 = rel:match('^{VST3}/?(.*)$')
  if vst3 then return NativePath(VST3.Dir() .. (vst3 ~= '' and ('/' .. vst3) or '')) end
  return NativePath(RES .. '/' .. rel)
end

---------------------------------------------------------------------------------------------------
-- JSON (just enough for the site's answers)
---------------------------------------------------------------------------------------------------

local function JsonEncode(v)
  local t = type(v)
  if t == 'table' then
    local parts = {}
    for k, x in pairs(v) do parts[#parts + 1] = JsonEncode(tostring(k)) .. ':' .. JsonEncode(x) end
    return '{' .. table.concat(parts, ',') .. '}'
  elseif t == 'string' then
    return '"' .. v:gsub('[%c"\\]', function(c)
      local m = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
      return m[c] or string.format('\\u%04x', c:byte())
    end) .. '"'
  elseif t == 'number' or t == 'boolean' then
    return tostring(v)
  end
  return 'null'
end

local function JsonDecode(s)
  local i = 1
  local function ws() i = s:find('[^ \t\r\n]', i) or #s + 1 end
  local val
  local function str()
    i = i + 1
    local out = {}
    while true do
      local c = s:sub(i, i)
      if c == '' then error('unterminated string') end
      if c == '"' then i = i + 1 break end
      if c == '\\' then
        local e = s:sub(i + 1, i + 1)
        local m = { b = '\b', f = '\f', n = '\n', r = '\r', t = '\t' }
        if e == 'u' then
          local cp = tonumber(s:sub(i + 2, i + 5), 16) or 63
          out[#out + 1] = utf8.char(cp)
          i = i + 6
        else
          out[#out + 1] = m[e] or e
          i = i + 2
        end
      else
        local j = s:find('["\\]', i) or #s + 1
        out[#out + 1] = s:sub(i, j - 1)
        i = j
      end
    end
    return table.concat(out)
  end
  function val()
    ws()
    local c = s:sub(i, i)
    if c == '{' then
      i = i + 1
      local o = {}
      ws()
      if s:sub(i, i) == '}' then i = i + 1 return o end
      while true do
        ws()
        local k = str()
        ws()
        i = i + 1 -- :
        o[k] = val()
        ws()
        local d = s:sub(i, i)
        i = i + 1
        if d == '}' then return o end
      end
    elseif c == '[' then
      i = i + 1
      local a = {}
      ws()
      if s:sub(i, i) == ']' then i = i + 1 return a end
      while true do
        a[#a + 1] = val()
        ws()
        local d = s:sub(i, i)
        i = i + 1
        if d == ']' then return a end
      end
    elseif c == '"' then
      return str()
    elseif s:sub(i, i + 3) == 'true' then i = i + 4 return true
    elseif s:sub(i, i + 4) == 'false' then i = i + 5 return false
    elseif s:sub(i, i + 3) == 'null' then i = i + 4 return nil
    else
      local num = s:match('^-?%d+%.?%d*[eE]?[-+]?%d*', i)
      if not num or num == '' then error('bad json at ' .. i) end
      i = i + #num
      return tonumber(num)
    end
  end
  local ok, res = pcall(val)
  if ok then return res end
  return nil
end

---------------------------------------------------------------------------------------------------
-- HTTP with curl (built into macOS and Windows 10+), always in the background: REAPER never waits
-- on the network. Each request is a curl config file run by a small script that REAPER starts
-- without waiting; the script leaves a done file. Work that needs the answer runs as a coroutine
-- (BG.Stepped, the Busy steps) and BG.Wait gives the frame back until curl is done.
-- (One table for the helpers: the main chunk is at Lua's 200 locals.)
---------------------------------------------------------------------------------------------------

local BG = {}

function BG.Quote(v) return '"' .. tostring(v):gsub('\\', '\\\\'):gsub('"', '\\"') .. '"' end
function BG.Name(p) return p:match('[^\\/]+$') end

-- every request gives up quickly on a dead connection
BG.CONNECT = 'connect-timeout = 4'

-- Windows: ways to start the batch file without waiting, best first. conhost --headless shows no
-- window at all (Windows 10 1809, build 17763, and later; it never starts a batch file whose path
-- has non-ASCII letters); a .vbs run by wscript starts it hidden (not where Script Host is turned
-- off, wscript then shows a message box); cmd.exe works everywhere but shows a console window.
-- A way that didn't start a job within 6 s is skipped for the session (wscript for good).
BG.WAYS = { 'conhost', 'wscript', 'cmd' }
function BG.Reg(key, name)
  local out = r.ExecProcess('reg query "' .. key .. '" /v ' .. name, 2000) or ''
  return ((out:match(name .. '%s+REG_%w+%s+([^\r\n]*)') or ''):gsub('%s+$', ''))
end
function BG.WshOff()
  if BG.noWsh == nil then
    BG.noWsh = false
    for _, root in ipairs({ 'HKCU', 'HKLM' }) do
      local v = BG.Reg(root .. '\\Software\\Microsoft\\Windows Script Host\\Settings', 'Enabled')
      if v:match('^0x0+$') or v == '0' then BG.noWsh = true end
    end
  end
  return BG.noWsh
end
function BG.Way(noConhost)
  if BG.way and not (noConhost and BG.way == 'conhost') then return BG.way end
  local build = BG.build or tonumber(r.GetExtState(EXT, 'winBuild'))
  if not BG.build and (not build or build < 17763) then -- an older Windows may have been updated since
    build = tonumber(BG.Reg('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion', 'CurrentBuildNumber')) or 0
    r.SetExtState(EXT, 'winBuild', tostring(build), true)
  end
  BG.build = build
  local skip = r.GetExtState(EXT, 'winSkip')
  BG.skipped = BG.skipped or {}
  local pick = 'cmd'
  for _, way in ipairs(BG.WAYS) do
    local ok = not skip:find(';' .. way .. ';', 1, true) and not BG.skipped[way]
    if way == 'conhost' then ok = ok and build >= 17763 and not noConhost end
    if way == 'wscript' then ok = ok and not BG.WshOff() end
    if ok then pick = way break end
  end
  if not noConhost then BG.way = pick end
  return pick
end
function BG.Skip(way)
  BG.skipped = BG.skipped or {}
  BG.skipped[way] = true
  local skip = r.GetExtState(EXT, 'winSkip')
  if way == 'wscript' and not skip:find(';wscript;', 1, true) then
    r.SetExtState(EXT, 'winSkip', (skip == '' and ';' or skip) .. 'wscript;', true)
  end
  BG.way = nil
end
function BG.LaunchWin(job)
  local way = BG.Way(job.sh:find('[\128-\255]') ~= nil)
  local sys = (os.getenv('SystemRoot') or 'C:\\Windows') .. '\\System32\\'
  local cmd
  if way == 'conhost' then
    cmd = '"' .. sys .. 'conhost.exe" --headless cmd.exe /d /c ""' .. job.sh .. '""'
  elseif way == 'wscript' then
    job.vbs = job.sh:gsub('%.bat$', '.vbs')
    if not WriteFile(job.vbs, table.concat({
      'On Error Resume Next',
      'p = WScript.ScriptFullName',
      'CreateObject("WScript.Shell").Run "cmd.exe /d /c """"" & Left(p, Len(p) - 4) & ".bat""""", 0, False',
      '' }, '\r\n')) then return false end
    cmd = '"' .. sys .. 'wscript.exe" //B //Nologo "' .. job.vbs .. '"'
  else
    cmd = 'cmd.exe /d /c ""' .. job.sh .. '""'
  end
  local ok = pcall(r.ExecProcess, cmd, -2)
  job.way = ok and way or nil
  job.ways = (job.ways and (job.ways .. '>') or '') .. way .. (ok and '' or '!') -- for the connection log
  return ok
end

-- Runs curl -K on the config lines in the background. Files in the temp folder are named without
-- their folder (the script cds there), so a user folder with non-ASCII letters never reaches the
-- script's text. curl's stdout (write-out) goes to job.code, its errors to job.err. limit: seconds
-- before the job counts as unanswered. nil when it couldn't start.
function BG.Spawn(lines, limit)
  local job = { cfg = TempFile('req.cfg'), code = TempFile('code.txt'), err = TempFile('err.txt'),
    done = TempFile('done.txt'), started = os.time(), limit = limit or 30, t0 = r.time_precise(), what = BG.What(lines) }
  if not WriteFile(job.cfg, table.concat(lines, '\n') .. '\n') then return nil end
  local ok
  if IS_WIN then
    local base = TempFile('run')
    job.sh, job.mark = base .. '.bat', base .. '.started'
    local n = BG.Name
    ok = WriteFile(job.sh, table.concat({
      '@echo off',
      'cd /d "%~dp0"',
      -- tells BG.Poll that this way of starting it works here
      ('type nul>"%s"'):format(n(job.mark)),
      'set "CURL=%SystemRoot%\\System32\\curl.exe"',
      'if not exist "%CURL%" set "CURL=curl"',
      ('"%%CURL%%" -K "%s" >"%s" 2>"%s"'):format(n(job.cfg), n(job.code), n(job.err)),
      'set "RC=%ERRORLEVEL%"',
      -- written under another name, then renamed: done never shows up while it's still open. It
      -- holds curl's exit code (redirect first: "echo 6>file" would redirect handle 6)
      ('>"%s.tmp" echo done %%RC%%'):format(n(job.done)),
      ('ren "%s.tmp" "%s"'):format(n(job.done), n(job.done)),
      '' }, '\r\n')) and BG.LaunchWin(job)
  else
    job.sh = TempFile('run.sh')
    ok = WriteFile(job.sh, string.format('#!/bin/sh\ncd %s || exit 1\n/usr/bin/curl -K %s > %s 2> %s\necho "done $?" > %s && mv %s %s\n',
      ShellQuote(TempDir()), ShellQuote(BG.Name(job.cfg)), ShellQuote(job.code), ShellQuote(job.err),
      ShellQuote(job.done .. '.tmp'), ShellQuote(job.done .. '.tmp'), ShellQuote(job.done)))
    if ok then os.execute('/bin/sh ' .. ShellQuote(job.sh) .. ' >/dev/null 2>&1 &') end
  end
  if not ok then
    BG.Clean(job)
    BG.Record(job, 'not started')
    return nil
  end
  return job
end

---------------------------------------------------------------------------------------------------
-- Connection log (the same as FX Devices'): the last 50 requests that failed (what it was, curl's
-- exit code and error, the HTTP code, how long it took, how Windows started it and what it fell
-- back to, the OS build, the REAPER and Script Manager versions), in REAPER's Data folder. Never a
-- license key, email, path or user name. The next request that works sends it to the site, at most
-- once a day, unless that's switched off (one switch for every Cool Reaper Script, at the bottom of
-- the window). Copy diagnostics puts it on the clipboard.
---------------------------------------------------------------------------------------------------

BG.DIAG = 'CoolReaperScripts_Diag'
BG.LOG_MAX = 50
BG.FIELDS = { 'first', 'last', 'n', 'what', 'kind', 'rc', 'http', 'ms', 'way', 'err', 'os', 'reaper', 'ver' }
BG.NUMBERS = { first = true, last = true, n = true, rc = true, http = true, ms = true }
-- an ExtState override points testers at a local copy of the site
BG.LOG_URL = r.GetExtState(BG.DIAG, 'url') ~= '' and r.GetExtState(BG.DIAG, 'url') or (SITE .. '/api/device?action=client-log')

function BG.LogPath()
  local dir = RES .. '/Data/CoolReaperScripts'
  r.RecursiveCreateDirectory(dir, 0)
  return dir .. '/netlog_script-manager.tsv'
end

-- one entry per line, tab-separated in BG.FIELDS order, oldest first
function BG.Log()
  if BG.log then return BG.log end
  local list = {}
  for line in (ReadFile(BG.LogPath()) or ''):gmatch('[^\r\n]+') do
    local e, i = {}, 0
    for v in (line .. '\t'):gmatch('([^\t]*)\t') do
      i = i + 1
      if BG.FIELDS[i] then e[BG.FIELDS[i]] = v end
    end
    if (e.kind or '') ~= '' then list[#list + 1] = e end
  end
  while #list > BG.LOG_MAX do table.remove(list, 1) end
  BG.log = list
  return list
end

function BG.LogSave(list)
  local lines = {}
  for _, e in ipairs(list) do
    local row = {}
    for i, k in ipairs(BG.FIELDS) do row[i] = (tostring(e[k] or ''):gsub('[\t\r\n]', ' ')) end
    lines[#lines + 1] = table.concat(row, '\t')
  end
  WriteFile(BG.LogPath(), table.concat(lines, '\n') .. (#lines > 0 and '\n' or ''))
end

-- curl's error text without anything personal: keys, emails, user names, file paths
function BG.Scrub(s)
  s = tostring(s or '')
  for _, var in ipairs({ 'USERNAME', 'USER' }) do
    local name = os.getenv(var)
    if name and #name >= 3 then s = s:gsub(name:gsub('%p', '%%%0'), '<x>') end
  end
  s = s:gsub('[%w%.%+%-_]+@[%w%-_]+%.[%w%.%-_]+', '<email>'):gsub(('%x'):rep(16) .. '%-' .. ('%x'):rep(8), '<x>')
    :gsub('%a:[\\/][^\r\n"\']*', '<path>'):gsub('\\\\[^\r\n"\']*', '<path>'):gsub('/[%w_%.%-]+/[^\r\n"\' ]*', '<path>')
  return (s:gsub('%s+', ' '):gsub('^ ', ''):gsub(' $', ''):sub(1, 240))
end

-- host and path of the request's first URL (never its query), and how many URLs a batch has
function BG.What(lines)
  local first, n = nil, 0
  for _, l in ipairs(lines) do
    local u = l:match('^url = "(.*)"$')
    if u then n = n + 1 first = first or u end
  end
  local what = ((first or ''):match('^%a+://([^?#]+)') or '?'):gsub('^www%.', '')
  return n > 1 and (what .. ' +' .. (n - 1)) or what
end

function BG.OsText()
  return OS .. ((IS_WIN and (BG.build or tonumber(r.GetExtState(EXT, 'winBuild')))) and (' build ' .. (BG.build or r.GetExtState(EXT, 'winBuild'))) or '')
end

-- Same request failing the same way again: one entry with a count, moved to the end
function BG.Record(job, kind, http, rc, err)
  if job.quiet then return end
  local list = BG.Log()
  local now = tostring(os.time())
  local e = { what = job.what or '?', kind = kind, rc = rc and tostring(rc) or '', http = http and tostring(http) or '',
    ms = job.t0 and tostring(math.floor((r.time_precise() - job.t0) * 1000)) or '', way = job.ways or '',
    err = BG.Scrub(err), os = BG.OsText(), reaper = r.GetAppVersion() or '', ver = 'Script Manager ' .. VERSION }
  for i = #list, 1, -1 do
    local o = list[i]
    if o.what == e.what and o.kind == e.kind and o.rc == e.rc and o.http == e.http and o.way == e.way
      and o.err == e.err and o.ver == e.ver then
      table.remove(list, i)
      e.first, e.n = o.first, tostring((tonumber(o.n) or 1) + 1)
      break
    end
  end
  e.first, e.last, e.n = e.first or now, now, e.n or '1'
  list[#list + 1] = e
  while #list > BG.LOG_MAX do table.remove(list, 1) end
  BG.LogSave(list)
end

-- What a finished (or given up) job says about the connection. A 4xx is the site's answer (a
-- wrong key), not a connection problem; downloads with 'fail' end with curl's exit code 22 instead.
function BG.Result(job, finished, printed, err)
  local rc = finished and tonumber((ReadFile(job.done) or ''):match('done%s+(%-?%d+)')) or nil
  local http = tonumber(printed:match('(%d%d%d)%s*$'))
  local kind
  if not finished then
    kind = (job.mark and not Exists(job.mark)) and 'not started' or 'timeout'
  elseif rc and rc ~= 0 then
    kind = 'curl'
  elseif not http or http == 0 or http >= 500 then
    kind = 'http'
  end
  if kind then return BG.Record(job, kind, http, rc, finished and err or '') end
  if job.ways and job.ways:find('>', 1, true) then BG.Record(job, 'fallback', http, rc, '') end
  BG.netOk = not job.quiet or BG.netOk
end

function BG.ReportsOn() return r.GetExtState(BG.DIAG, 'off') ~= '1' end
function BG.SetReports(on) r.SetExtState(BG.DIAG, 'off', on and '' or '1', true) end

-- Anonymous ID of this computer for the reports, shared by every Cool Reaper Script: a hash of
-- FX Devices' device ID when there's one (what FX Devices uses too), made once
function BG.DevHash()
  local id = r.GetExtState(BG.DIAG, 'id')
  if id ~= '' then return id end
  local s = 'crs-diag|' .. r.GetExtState('CRS_FX_Devices_License', 'deviceId')
  if s == 'crs-diag|' then s = s .. tostring(os.time()) .. tostring(r.time_precise()) .. tostring({}) end
  local h1, h2 = 0x811C9DC5, 0x2545F491
  for i = 1, #s do
    local b = s:byte(i)
    h1 = ((h1 ~ b) * 0x01000193) & 0xFFFFFFFF
    h2 = (((h2 ~ b) * 0x5BD1E995) + i * 0x9E37) & 0xFFFFFFFF
  end
  id = string.format('%08x%04x', h1, h2 & 0xFFFF)
  r.SetExtState(BG.DIAG, 'id', id, true)
  return id
end

-- Once a day, after a request that worked (called every frame): send the log, newest entries
-- first up to 12 KB; the ones sent are dropped when the site took them
function BG.UploadTick()
  local up = BG.upload
  if up then
    if BG.Poll(up.job) == nil then return end
    BG.upload = nil
    local data = JsonDecode(ReadFile(up.out) or '')
    os.remove(up.out)
    if type(data) ~= 'table' or data.ok ~= true then return end
    local keep = {}
    for _, e in ipairs(BG.Log()) do
      if (tonumber(e.last) or 0) > up.upTo then keep[#keep + 1] = e end
    end
    BG.log = keep
    BG.LogSave(keep)
    return
  end
  if not BG.netOk then return end
  BG.netOk = nil
  local list = BG.Log()
  if #list == 0 or not BG.ReportsOn() then return end
  local now, last = os.time(), tonumber(r.GetExtState(BG.DIAG, 'sent_script-manager')) or 0
  if last <= now + 3600 and now - last < 86400 then return end
  r.SetExtState(BG.DIAG, 'sent_script-manager', tostring(now), true)
  local items, size = {}, 0
  for i = #list, 1, -1 do
    local parts = {}
    for _, k in ipairs(BG.FIELDS) do
      local v = list[i][k] or ''
      if BG.NUMBERS[k] then v = tonumber(v) and math.floor(tonumber(v)) or nil end
      parts[#parts + 1] = JsonEncode(k) .. ':' .. JsonEncode(v)
    end
    local j = '{' .. table.concat(parts, ',') .. '}'
    if size + #j > 12000 then break end
    table.insert(items, 1, j)
    size = size + #j + 1
  end
  local bodyFile, out = TempFile('body.json'), TempFile('out.txt')
  if not WriteFile(bodyFile, ('{"product":"script-manager","dev":%s,"entries":[%s]}'):format(JsonEncode(BG.DevHash()), table.concat(items, ','))) then return end
  local job = BG.Spawn(BG.PostLines(BG.LOG_URL, bodyFile, BG.Name(out), 15), 30)
  if not job then os.remove(bodyFile) return end
  job.body, job.quiet = bodyFile, true
  BG.upload = { job = job, out = out, upTo = now }
end

-- The log and this computer's setup, for a support email
function BG.Diagnostics()
  local lines = {
    'Script Manager ' .. VERSION .. ', REAPER ' .. (r.GetAppVersion() or '?') .. ', ' .. BG.OsText(),
    'Computer: ' .. BG.DevHash() .. (IS_WIN and ('  launcher: ' .. tostring(BG.way or '-') .. '  skipped: '
      .. (r.GetExtState(EXT, 'winSkip') ~= '' and r.GetExtState(EXT, 'winSkip') or '-')) or ''),
    'Connection reports: ' .. (BG.ReportsOn() and 'on' or 'off'),
    '',
  }
  local list = BG.Log()
  lines[#lines + 1] = #list > 0 and ('Failed requests (%d, newest last):'):format(#list) or 'No failed requests.'
  for _, e in ipairs(list) do
    lines[#lines + 1] = ('%s  %s  %s%s%s%s  %sms%s%s'):format(os.date('%Y-%m-%d %H:%M', tonumber(e.last) or 0),
      e.what, e.kind, e.rc ~= '' and (' rc=' .. e.rc) or '', e.http ~= '' and (' http=' .. e.http) or '',
      (tonumber(e.n) or 1) > 1 and (' x' .. e.n) or '', e.ms, e.way ~= '' and ('  via ' .. e.way) or '',
      e.err ~= '' and ('  ' .. e.err) or '')
  end
  return table.concat(lines, '\n')
end

function BG.Clean(job)
  for _, k in ipairs({ 'cfg', 'code', 'err', 'done', 'sh', 'vbs', 'mark', 'body', 'out' }) do
    if job[k] then os.remove(job[k]) end
  end
end

-- requests nobody waits for anymore: their files go once curl is done
BG.orphans = {}
function BG.Sweep()
  for i = #BG.orphans, 1, -1 do
    local job = BG.orphans[i]
    if Exists(job.done) or os.time() - job.started > job.limit then
      BG.Clean(job)
      table.remove(BG.orphans, i)
    end
  end
end

-- nil while curl runs; then what it wrote to stdout and stderr ('' when it took too long)
function BG.Poll(job)
  if #BG.orphans > 0 then BG.Sweep() end
  if not Exists(job.done) then
    -- Windows: the batch file hasn't started after 6 s, so that way of starting it doesn't work on
    -- this computer; this job and the next ones try the next way
    if job.way and os.time() - job.started >= 6 then
      if job.way ~= 'cmd' and not Exists(job.mark) then
        BG.Skip(job.way)
        if job.vbs then os.remove(job.vbs) job.vbs = nil end
        job.started = BG.LaunchWin(job) and os.time() or 0
      else
        job.way = nil -- it started
      end
    end
    if os.time() - job.started < job.limit then return nil end
  end
  local finished = Exists(job.done)
  local code, err = finished and ReadFile(job.code) or '', finished and ReadFile(job.err) or ''
  pcall(BG.Result, job, finished, code or '', err or '')
  job.out = nil -- the caller reads its output file
  BG.Clean(job)
  return code or '', err or ''
end

-- BG.Poll a frame at a time, inside a coroutine. Outside one it would have to hold REAPER, so it
-- doesn't wait: the request counts as unanswered.
function BG.Wait(job)
  while true do
    local code, err = BG.Poll(job)
    if code ~= nil then return code, err end
    if not coroutine.isyieldable() then
      BG.orphans[#BG.orphans + 1] = job
      return '', 'not answered in time'
    end
    coroutine.yield()
  end
end

-- fn as a tick function: each call runs it until it waits on the network (then nil) or ends (then
-- what it returned); the next call goes on where it waited
function BG.Stepped(fn)
  local co
  return function(...)
    co = co or coroutine.create(fn)
    local res = table.pack(coroutine.resume(co, ...))
    if not res[1] then
      local c = co
      co = nil
      error(debug.traceback(c, res[2]), 0)
    end
    if coroutine.status(co) ~= 'dead' then return nil end
    co = nil
    return table.unpack(res, 2, res.n)
  end
end

-- a JSON POST: config lines (write-out = the HTTP code)
function BG.PostLines(url, bodyFile, out, maxTime)
  return { 'url = ' .. BG.Quote(url), 'request = "POST"', 'header = "Content-Type: application/json"',
    'data-binary = ' .. BG.Quote('@' .. BG.Name(bodyFile)), 'output = ' .. BG.Quote(out),
    'location', 'silent', 'show-error', BG.CONNECT, 'max-time = ' .. (maxTime or 90), 'write-out = "%{http_code}"' }
end

-- Returns http code (number or nil), response text (when outPath is nil), error text
local function Post(url, body, outPath)
  local bodyFile = TempFile('body.json')
  if not WriteFile(bodyFile, JsonEncode(body)) then return nil, nil, 'Could not write to the temp folder' end
  local out = outPath or TempFile('out.txt')
  local job = BG.Spawn(BG.PostLines(url, bodyFile, outPath or BG.Name(out)), 110)
  if not job then os.remove(bodyFile) return nil, nil, 'Could not start curl' end
  job.body = bodyFile
  if type(body) == 'table' and body.action then job.what = job.what .. ' ' .. tostring(body.action) end
  local printed, err = BG.Wait(job)
  if not outPath and BG.orphans[#BG.orphans] == job then job.out = out end
  local code = tonumber(printed:match('(%d%d%d)%s*$'))
  if not code and err == '' then err = 'no answer' end
  local text
  if not outPath then
    text = ReadFile(out)
    os.remove(out)
  end
  if code == 0 then code = nil end
  return code, text, err
end

-- JSON request; returns the decoded answer or nil + a message for people
local function Api(url, body)
  local code, text, err = Post(url, body)
  if not code then return nil, 'Couldn\'t reach coolreaperscripts.com. Check your internet connection.' .. (err and err ~= '' and ('\n' .. err:sub(1, 200)) or '') end
  local data = text and JsonDecode(text)
  if type(data) ~= 'table' then return nil, 'The server sent an unexpected answer (HTTP ' .. code .. ').' end
  if code >= 400 or data.ok == false then return nil, data.error or data.reason or ('HTTP ' .. code), data end
  return data
end

-- The same POST without waiting at all, for the sign-in polls: AsyncPost returns a job;
-- AsyncResult(job) is nil until curl is done, then the answer (decoded).
local function AsyncPost(url, body)
  local bodyFile, out = TempFile('body.json'), TempFile('out.txt')
  if not WriteFile(bodyFile, JsonEncode(body)) then return nil end
  local job = BG.Spawn(BG.PostLines(url, bodyFile, BG.Name(out), 15), 30)
  if not job then os.remove(bodyFile) return nil end
  job.body, job.outFile = bodyFile, out
  if type(body) == 'table' and body.action then job.what = job.what .. ' ' .. tostring(body.action) end
  return job
end

local function AsyncResult(job)
  if BG.Poll(job) == nil then return nil end
  local text = ReadFile(job.outFile)
  os.remove(job.outFile)
  local data = text and JsonDecode(text)
  return type(data) == 'table' and data or false
end

---------------------------------------------------------------------------------------------------
-- Free REAPER extensions the scripts need. Official builds are downloaded from their authors'
-- release pages into UserPlugins; REAPER loads them after a restart.
---------------------------------------------------------------------------------------------------

-- A finished download in tmp: move it to path when it's a non-empty file that came with HTTP 200
local function GetFinish(tmp, path, code)
  local f = io.open(tmp, 'rb')
  local size = f and f:seek('end') or 0
  if f then f:close() end
  if code == 200 and size > 0 then
    os.remove(path)
    if os.rename(tmp, path) then return true end
    os.remove(tmp)
    return false, 'could not write ' .. path .. ' (is REAPER using it?)'
  end
  os.remove(tmp)
  return false, (code == 200 and 'empty download') or (code and ('HTTP ' .. code)) or 'no connection'
end

-- Size of a file so far (a download in progress), in bytes
local function FileSize(p)
  local f = io.open(p, 'rb')
  local size = f and f:seek('end') or 0
  if f then f:close() end
  return size
end

-- Download url to path in the background (follows redirects); poll with GetPoll. maxTime caps the
-- whole download (300 s when not given); a dead connection gives up after 4 s. nil when it
-- couldn't start.
local function GetStart(url, path, maxTime)
  local h = { path = path, tmp = path .. '.download' }
  os.remove(h.tmp)
  h.job = BG.Spawn({ 'url = ' .. BG.Quote(url), 'output = ' .. BG.Quote(h.tmp), 'location', 'fail', 'silent', 'show-error',
    BG.CONNECT, 'max-time = ' .. (maxTime or 300), 'write-out = "%{http_code}"' }, (maxTime or 300) + 15)
  return h.job and h or nil
end

-- nil while downloading; then true, or false + why
local function GetPoll(h)
  local printed = BG.Poll(h.job)
  if printed == nil then return nil end
  return GetFinish(h.tmp, h.path, tonumber(printed:match('(%d%d%d)%s*$')))
end

-- Download url to path; true when it got a non-empty file with HTTP 200 (waits in a coroutine)
local function Get(url, path, maxTime)
  local h = GetStart(url, path, maxTime or 120)
  if not h then return false, 'could not start curl' end
  local printed = BG.Wait(h.job)
  return GetFinish(h.tmp, h.path, tonumber(printed:match('(%d%d%d)%s*$')))
end

-- This REAPER's build: asset suffix used by ReaPack, ReaImGui and SWS releases, and ReaPack's
-- platform names (most specific first) for packages listed in a ReaPack index
local function Platform()
  local os_, app = r.GetOS(), (r.GetAppVersion() or ''):lower()
  if IS_WIN then
    if app:find('arm64ec') then return { arch = 'arm64ec', fallback = 'x64', ext = 'dll', names = { 'windows-arm64ec', 'win64', 'windows', 'win' } } end
    if os_ == 'Win32' then return { arch = 'x86', ext = 'dll', names = { 'win32', 'windows', 'win' } } end
    return { arch = 'x64', ext = 'dll', names = { 'win64', 'windows', 'win' } }
  elseif os_:match('OSX') or os_:match('macOS') then
    if os_:find('arm64') or app:find('arm64') then return { arch = 'arm64', ext = 'dylib', names = { 'darwin-arm64', 'darwin' } } end
    if os_ == 'OSX32' then return { arch = 'i386', ext = 'dylib', names = { 'darwin32', 'darwin' } } end
    return { arch = 'x86_64', ext = 'dylib', names = { 'darwin64', 'darwin' } }
  end
  if app:find('aarch64') or app:find('arm64') then return { arch = 'aarch64', ext = 'so', names = { 'linux-aarch64', 'linux' } } end
  if app:find('armv7') then return { arch = 'armv7l', ext = 'so', names = { 'linux-armv7l', 'linux' } } end
  if app:find('i686') then return { arch = 'i686', ext = 'so', names = { 'linux32', 'linux' } } end
  return { arch = 'x86_64', ext = 'so', names = { 'linux64', 'linux-x86_64', 'linux' } }
end

-- Newest build of a package listed in a ReaPack index: the extension binary for this computer,
-- plus the url of each file named in extras (ReaImGui's Lua files, which ReaPack would add)
local indexCache = {}
local function FromReaPackIndex(indexUrl, package, plat, extras)
  local xml = indexCache[indexUrl]
  if not xml then
    local idx = TempFile('index.xml')
    local ok, err = Get(indexUrl, idx)
    xml = ok and ReadFile(idx)
    os.remove(idx)
    if not xml then return nil, err end
    indexCache[indexUrl] = xml
  end
  local s = xml:find('<reapack name="' .. package .. '"', 1, true)
  if not s then return nil, package .. ' not listed' end
  local block = xml:sub(s, (xml:find('</reapack>', s, true) or #xml))
  local last
  for v in block:gmatch('<version.-</version>') do last = v end -- versions are listed oldest first
  if not last then return nil, 'no versions of ' .. package end
  local sources = {}
  for attrs, url in last:gmatch('<source([^>]*)>([^<]+)</source>') do
    local file = attrs:match('file="([^"]+)"') or url:match('([^/]+)$')
    sources[#sources + 1] = { platform = attrs:match('platform="([^"]+)"') or 'all',
      file = file:match('([^/\\]+)$'), url = (url:gsub('&amp;', '&')) }
  end
  local found
  for _, name in ipairs(plat.names) do
    for _, src in ipairs(sources) do
      if not found and src.platform == name and src.file:match('%.' .. plat.ext .. '$') then found = src end
    end
  end
  if not found then return nil, 'no build of ' .. package .. ' for this computer' end
  local res = { url = found.url, file = found.file, extras = {} }
  for _, want in ipairs(extras or {}) do
    for _, src in ipairs(sources) do
      if src.file == want then res.extras[#res.extras + 1] = src end
    end
  end
  if #res.extras < #(extras or {}) then return nil, 'some of ' .. package .. '\'s files aren\'t listed' end
  return res
end

-- The scripts' settings windows ("Scripts and updates") run the Manager from here.
local function ManagerPath() return NativePath(RES .. '/' .. MANAGER_DIR .. '/' .. MANAGER_FILE) end

-- Run from Downloads (or anywhere outside REAPER's Scripts folder), the Manager copies itself to
-- Scripts/CoolReaperScripts, puts that copy in the Actions list instead, and removes the download.
-- Returns a note for the window, if there's something to say.
local function SettleIn()
  local _, self = r.get_action_context()
  if not self or self == '' then
    local src = debug.getinfo(1, 'S').source or ''
    self = src:sub(1, 1) == '@' and src:sub(2) or nil
  end
  if not self or not Exists(self) then return end
  local function Norm(path)
    path = path:gsub('\\', '/'):gsub('/+', '/')
    return IS_WIN and path:lower() or path
  end
  local scripts = Norm(RES .. '/Scripts/')
  if Norm(self):sub(1, #scripts) == scripts then
    -- kept somewhere else in Scripts: still put a copy where the scripts look for it
    if Norm(self) ~= Norm(ManagerPath()) and not Exists(ManagerPath()) then
      local data = ReadFile(self)
      r.RecursiveCreateDirectory(DirOf(ManagerPath()), 0)
      if data then WriteFile(ManagerPath(), data) end
    end
    return
  end
  local target = ManagerPath()
  local data = ReadFile(self)
  r.RecursiveCreateDirectory(DirOf(target), 0)
  if not data or not WriteFile(target, data) then
    return { kind = 'warn', text = 'Couldn\'t copy the Script Manager into REAPER\'s Scripts folder, so it keeps running from where you downloaded it.' }
  end
  r.AddRemoveReaScript(true, 0, target, true)
  r.AddRemoveReaScript(false, 0, self, true)
  local removed = os.remove(self)
  return { kind = 'ok', text = 'The Script Manager moved itself into REAPER'
    .. (removed and ', so the downloaded file is gone. ' or '. You can delete the downloaded file. ')
    .. 'After this install you won\'t need it again: every Cool Reaper Script opens it from its settings window (Scripts and updates).' }
end

local EXTENSIONS = {
  { name = 'ReaPack', why = 'installs and updates REAPER add-ons', file = 'reaper_reapack',
    loaded = function() return r.ReaPack_BrowsePackages ~= nil end,
    asset = 'https://github.com/cfillion/reapack/releases/latest/download/reaper_reapack-%s.%s', hasArm64ec = true },
  { name = 'ReaImGui', why = 'draws the scripts\' windows', file = 'reaper_imgui',
    loaded = function() return r.ImGui_GetBuiltinPath ~= nil end,
    -- Vertical FX List needs 0.10 (Col_InputTextCursor is new in it); the Manager itself 0.9.3
    outdated = function() return r.ImGui_Col_InputTextCursor == nil end,
    -- scripts load ReaImGui through imgui.lua, which ReaPack puts next to the binary's API docs
    index = 'https://github.com/ReaTeam/Extensions/raw/master/index.xml', package = 'reaper_imgui.ext',
    extras = { 'imgui.lua', 'gfx2imgui.lua' },
    extrasDir = function()
      return r.ImGui_GetBuiltinPath and r.ImGui_GetBuiltinPath() or (RES .. '/Scripts/ReaTeam Extensions/API')
    end },
  { name = 'js_ReaScriptAPI', why = 'mouse and window helpers', file = 'reaper_js_ReaScriptAPI',
    loaded = function() return r.JS_Window_Find ~= nil end,
    index = 'https://github.com/ReaTeam/Extensions/raw/master/index.xml', package = 'js_ReaScriptAPI.ext' },
  { name = 'SWS Extension', why = 'extra track and send functions', file = 'reaper_sws',
    loaded = function() return r.CF_ShellExecute ~= nil or r.BR_GetSetTrackSendInfo ~= nil end,
    asset = 'https://github.com/reaper-oss/sws/releases/latest/download/reaper_sws-%s.%s' },
}

local PLUGINS = RES .. SEP .. 'UserPlugins'

-- Is the extension's file in UserPlugins already? (downloaded, but REAPER hasn't loaded it yet)
local onDisk
local function OnDisk(e)
  if not onDisk then
    onDisk = {}
    local ext = '%.' .. Platform().ext .. '$'
    r.EnumerateFiles(PLUGINS, -1) -- re-read the folder
    local i = 0
    while true do
      local f = r.EnumerateFiles(PLUGINS, i)
      if not f then break end
      if f:match(ext) then onDisk[#onDisk + 1] = f:lower() end
      i = i + 1
    end
  end
  local prefix = e.file:lower()
  for _, f in ipairs(onDisk) do
    if f:sub(1, #prefix) == prefix then return true end
  end
  return false
end

-- 'ok', 'outdated', 'restart' (downloaded, loads after a restart) or 'missing'
local downloadedNow = {} -- names installed by this run
-- loaded, but its Lua files are missing (an older Manager downloaded only the binary)
local function ExtrasMissing(e)
  if not e.extras then return false end
  for _, f in ipairs(e.extras) do
    if not Exists(NativePath(e.extrasDir() .. '/' .. f)) then return true end
  end
  return false
end

local function ExtStatus(e)
  if downloadedNow[e.name] then return 'restart' end
  if e.loaded() then return ((e.outdated and e.outdated()) or ExtrasMissing(e)) and 'outdated' or 'ok' end
  return OnDisk(e) and 'restart' or 'missing'
end

-- the ones to download: missing or too old
local function MissingExtensions()
  local list = {}
  for _, e in ipairs(EXTENSIONS) do
    local st = ExtStatus(e)
    if st == 'missing' or st == 'outdated' then list[#list + 1] = e end
  end
  return list
end

-- Installing extensions is a job of single file downloads in the background, one at a time, so a
-- window can show progress in between.
local function InstallJob(list)
  return { list = list, steps = nil, n = 0, bad = {}, binary = {}, label = 'Getting ready...' }
end

-- the files to download, per extension; looking them up reads the ReaPack index (a small download)
local function PlanInstall(job)
  local plat = Platform()
  job.steps = {}
  for _, e in ipairs(job.list) do
    local url, file, extras, found, err
    if e.asset then
      local arch = (plat.arch == 'arm64ec' and not e.hasArm64ec) and plat.fallback or plat.arch
      url = e.asset:format(arch, plat.ext)
      file = url:match('([^/]+)$')
    else
      found, err = FromReaPackIndex(e.index, e.package, plat, e.extras)
      if found then url, file, extras = found.url, found.file, found.extras end
    end
    -- the loaded binary is current: only its Lua files are needed
    local binary = not (e.loaded() and not (e.outdated and e.outdated()))
    if url and binary then
      job.steps[#job.steps + 1] = { e = e, url = url, path = PLUGINS .. SEP .. file, binary = true }
    end
    for _, x in ipairs(extras or {}) do
      job.steps[#job.steps + 1] = { e = e, url = x.url, path = NativePath(e.extrasDir() .. '/' .. x.file) }
    end
    if not found and not url then job.bad[e.name] = err or 'not found' end
  end
end

local function StepLabel(job, st)
  return 'Downloading ' .. st.e.name .. '  (' .. (job.n + 1) .. ' of ' .. #job.steps .. ')'
end

local function FinishStep(job, st, ok, err)
  if ok then
    if st.binary then job.binary[st.e.name] = true end
  elseif not job.bad[st.e.name] then
    -- Windows won't let anyone replace an extension REAPER has loaded
    if st.binary and st.e.loaded() and err and err:find('could not write') then err = 'REAPER is using the old version' end
    job.bad[st.e.name] = err or 'download failed'
  end
  job.n, job.get = job.n + 1, nil
end

-- Moves the job along; true once everything is downloaded (job.done, job.failed, job.restart).
-- Looking up the files waits on a ReaPack index in the background (then it returns nil).
local InstallTick = BG.Stepped(function(job)
  if job.finished then return true end
  if not job.steps then
    PlanInstall(job)
    r.RecursiveCreateDirectory(PLUGINS, 0)
  elseif job.get then
    local ok, err = GetPoll(job.get)
    if ok ~= nil then FinishStep(job, job.steps[job.n + 1], ok, err) end
  elseif job.n < #job.steps then
    local st = job.steps[job.n + 1]
    if job.bad[st.e.name] then
      job.n = job.n + 1 -- one of its files already failed
    else
      r.RecursiveCreateDirectory(DirOf(st.path), 0)
      job.get = GetStart(st.url, st.path)
      if not job.get then FinishStep(job, st, false, 'could not start curl') end
    end
  else
    job.done, job.failed, job.restart = {}, {}, false
    for _, e in ipairs(job.list) do
      if job.bad[e.name] then
        job.failed[#job.failed + 1] = { name = e.name, why = job.bad[e.name] }
      else
        job.done[#job.done + 1] = e.name
        if job.binary[e.name] then downloadedNow[e.name], job.restart = true, true end
      end
    end
    job.finished = true
    return true
  end
  local st = job.steps and job.steps[job.n + 1]
  job.label = st and StepLabel(job, st) or 'Finishing...'
  job.frac = job.steps and #job.steps > 0 and (job.n / #job.steps) or 0
  job.bytes = job.get and FileSize(job.get.tmp) or nil
  return false
end)

local function MB(bytes) return string.format('%.1f MB', bytes / 1048576) end

local FIND_MANAGER = 'It\'s in Actions > Show action list: search for "Cool Reaper Script Manager".'

local function ExtensionReport(done, failed, restart)
  local msg = ''
  if #done > 0 then msg = 'Installed ' .. table.concat(done, ', ') .. '.'
    .. (restart and '\n\nRestart REAPER, then run the Script Manager again.' or '') end
  if #failed > 0 then
    local lines = {}
    for _, f in ipairs(failed) do lines[#lines + 1] = f.name .. ': ' .. f.why end
    msg = msg .. (msg ~= '' and '\n\n' or '') .. 'Could not install:\n' .. table.concat(lines, '\n')
      .. (r.ReaPack_BrowsePackages and '\n\nYou can install them with ReaPack instead: Extensions > ReaPack > Browse packages.'
        or '\n\nYou can install them with ReaPack (reapack.com) instead.')
  end
  return msg
end

-- The window needs ReaImGui. Without it (or with one too old), setup happens in message boxes.
local SETTLE_NOTE = SettleIn()
local imguiOK = r.ImGui_GetBuiltinPath ~= nil
if imguiOK then
  package.path = r.ImGui_GetBuiltinPath() .. '/?.lua'
  local ok, imgui = pcall(require, 'imgui')
  imguiOK = ok and type(imgui) == 'function' and pcall(imgui, '0.9.3')
end

-- Message boxes and a small progress window; the Manager's own window opens afterwards when only
-- ReaImGui's Lua files were missing
local function SetupWithoutWindow()
  local box = TITLE .. ': setup'
  local function Bullets(list)
    local t = {}
    for _, e in ipairs(list) do t[#t + 1] = '  \u{2022} ' .. e.name .. ' (' .. e.why .. ')' end
    return table.concat(t, '\n')
  end
  local todo, waiting = MissingExtensions(), {}
  for _, e in ipairs(EXTENSIONS) do
    if ExtStatus(e) == 'restart' then waiting[#waiting + 1] = e end
  end
  -- ReaImGui loaded but scripts can't use it: fetch its files again
  local imgui = EXTENSIONS[2]
  if ExtStatus(imgui) == 'ok' then table.insert(todo, 1, imgui) end

  local msg
  if #todo == 0 then
    msg = 'These free extensions are downloaded and load the next time REAPER starts:\n\n' .. Bullets(waiting)
      .. '\n\nRestart REAPER, then run the Script Manager again.\n\n'
      .. 'Already restarted and still seeing this? Choose Yes to download them again.'
    todo = waiting
  else
    local old = ExtStatus(imgui) == 'outdated' or ExtStatus(imgui) == 'ok'
    msg = 'Cool Reaper Scripts need a few free REAPER extensions'
      .. (old and ' (ReaImGui needs an update)' or '') .. ':\n\n' .. Bullets(todo)
      .. (#waiting > 0 and ('\n\nAlready downloaded, loads after a restart:\n' .. Bullets(waiting)) or '')
      .. '\n\nInstall them now? It takes a few seconds. They come straight from their authors\' '
      .. 'official download pages and go into REAPER\'s UserPlugins folder.'
  end
  if r.ShowMessageBox(msg, box, 4) ~= 6 then return end

  -- a small window shows the downloads (REAPER's own drawing: ReaImGui isn't there yet)
  local job = InstallJob(todo)
  local W, H = 480, 140
  local l, t, rr, bb = r.my_getViewport(0, 0, 0, 0, 0, 0, 0, 0, true)
  gfx.init(box, W, H, 0, math.floor((l + rr - W) / 2), math.floor((t + bb - H) / 2))
  local frames = 0
  local function Draw()
    gfx.set(0.043, 0.047, 0.059) gfx.rect(0, 0, gfx.w, gfx.h, 1)
    gfx.setfont(1, 'Arial', 18, string.byte('b'))
    gfx.set(0.9, 0.91, 0.92) gfx.x, gfx.y = 20, 18 gfx.drawstr('Installing the free extensions')
    gfx.setfont(2, 'Arial', 15)
    gfx.set(0.66, 0.69, 0.72) gfx.x, gfx.y = 20, 50
    gfx.drawstr(job.label .. (job.bytes and job.bytes > 0 and ('   ' .. MB(job.bytes)) or ''))
    local bw = gfx.w - 40
    gfx.set(1, 1, 1, 0.1) gfx.rect(20, 82, bw, 6, 1)
    gfx.set(0.29, 0.8, 0.52, 1) gfx.rect(20, 82, math.max(6, math.floor(bw * (job.frac or 0))), 6, 1)
    gfx.set(0.43, 0.46, 0.5) gfx.x, gfx.y = 20, 104
    gfx.drawstr('From the authors\' official download pages. Keep REAPER open.')
    gfx.update()
  end
  local function Done()
    gfx.quit()
    local report = ExtensionReport(job.done, job.failed, job.restart)
    if r.ImGui_GetBuiltinPath then
      package.path = r.ImGui_GetBuiltinPath() .. '/?.lua'
      package.loaded.imgui = nil
      local ok, imgui = pcall(require, 'imgui')
      if ok and type(imgui) == 'function' and pcall(imgui, '0.9.3') then
        -- only ReaImGui's Lua files were missing: open the Manager's window right away
        local _, self = r.get_action_context()
        local path = Exists(ManagerPath()) and ManagerPath() or self
        if path and Exists(path) then dofile(path) return end
      end
    end
    if #job.done > 0 and job.restart then report = report .. '\n\n' .. FIND_MANAGER end
    if #job.failed == 0 then
      r.ShowMessageBox(report, box, 0)
    elseif r.ReaPack_BrowsePackages then
      if r.ShowMessageBox(report .. '\n\nOpen ReaPack now?', box, 4) == 6 then r.ReaPack_BrowsePackages(job.failed[1].name) end
    else
      if r.ShowMessageBox(report .. '\n\nOpen reapack.com now?', box, 4) == 6 then OpenUrl('https://reapack.com') end
    end
  end
  local function Loop()
    frames = frames + 1
    Draw()
    -- closing the window cancels what's left (a file that's downloading still finishes)
    if gfx.getchar() < 0 then return end
    -- draw twice before the first download, so the window is up
    if frames > 2 and InstallTick(job) then
      Draw()
      return r.defer(Done)
    end
    r.defer(Loop)
  end
  r.defer(Loop)
end

if not imguiOK then
  SetupWithoutWindow()
  return
end
local im = require 'imgui' '0.9.3'

---------------------------------------------------------------------------------------------------
-- Fonts: the Monolith look uses Anton (titles) and JetBrains Mono (labels), both SIL Open Font
-- License. They're downloaded once from the site, in the background; until they're in, the window
-- uses REAPER's fonts.
---------------------------------------------------------------------------------------------------

local FONT_DIR = NativePath(RES .. '/Scripts/CoolReaperScripts/Script Manager/Fonts')
local PREVIEW_DIR = NativePath(RES .. '/Scripts/CoolReaperScripts/Script Manager/Previews')
local FONT_FILES = { 'Anton-Regular.ttf', 'JetBrainsMono-Medium.ttf', 'JetBrainsMono-SemiBold.ttf' }

local function EnsureFonts()
  r.RecursiveCreateDirectory(FONT_DIR, 0)
  -- an FX Devices install already has them
  local fxd = NativePath(RES .. '/Scripts/FX Devices/BryanChi_FX_Devices/src/Fonts')
  for _, f in ipairs(FONT_FILES) do
    local dest = FONT_DIR .. SEP .. f
    if not Exists(dest) then
      local data = ReadFile(fxd .. SEP .. f)
      if data then WriteFile(dest, data)
      else
        BG.fonts = BG.fonts or {}
        BG.fonts[#BG.fonts + 1] = GetStart(FONT_URL .. f, dest, 60)
      end
    end
  end
end
EnsureFonts()

---------------------------------------------------------------------------------------------------
-- State
---------------------------------------------------------------------------------------------------

local S = {
  email = r.GetExtState(EXT, 'email'),
  msg = nil,                 -- { kind = 'err'|'ok'|'info'|'warn', text } under the title
  busy = nil,                -- { label, fn, frames, co }: one step that waits on the site, after its label drew
  products = {},             -- from the site, plus releases, choice, installed, key, lic, ...
  job = nil,                 -- the install in progress
  loaded = false,
}

local function Busy(label, fn) S.busy = { label = label, fn = fn, frames = 0 } end

local function Friendly(err)
  local l = tostring(err or ''):lower()
  if l:find('not found') or l:find('invalid') then return 'That key wasn\'t recognized. Use the key from your purchase or trial email.' end
  if l:find('expired') then return 'This key has expired. Buy a license to keep using and updating the script.' end
  return tostring(err)
end

-- expiry as unix seconds (the site sends ISO dates; older answers sent milliseconds)
local function ExpiryUnix(v)
  local n = tonumber(v)
  if n then return n > 1e11 and n / 1000 or n end
  local y, m, d, H, M = tostring(v or ''):match('^(%d+)-(%d+)-(%d+)T?(%d*):?(%d*)')
  if not y then return nil end
  -- the date is UTC; os.time reads a table as local time
  local now = os.time()
  local utcOffset = now - os.time(os.date('!*t', now))
  return os.time({ year = tonumber(y), month = tonumber(m), day = tonumber(d), hour = tonumber(H) or 12, min = tonumber(M) or 0 }) + utcOffset
end

local function DaysLeft(v)
  local t = ExpiryUnix(v)
  return t and math.max(0, math.ceil((t - os.time()) / 86400)) or nil
end

local function InstallPath(p, rel) return NativePath(RES .. '/' .. p.installDir .. '/' .. rel) end

local function MainScriptPath(p)
  return p.mainScript and InstallPath(p, p.mainScript.to) or nil
end

local function InstalledVersion(p)
  -- a product whose file is gone isn't installed, whatever was noted (Prism EQ: the JSFX before the plugin)
  if p.kind == 'clap' and not Exists(ResPath(p.installedFile or '')) then return nil end
  local v = r.GetExtState(EXT, 'installed_' .. p.id)
  if v ~= '' then return v end
  local txt = ReadFile(InstallPath(p, 'version.txt'))
  local tag = txt and txt:match('release:%s*([%w%.%-]+)')
  if tag then return tag end
  -- installed some other way (ReaPack, a copy): there, but the version is unknown
  local main = MainScriptPath(p)
  if main and Exists(main) then return 'installed' end
  -- products without a script (Prism EQ): their file is there, from FX Devices or a download
  if p.installedFile and Exists(ResPath(p.installedFile)) then return 'installed' end
  return nil
end

local function IsDev(v) return v == 'development version' end

-- Copies of a product's file that would show up twice in the FX browser: the website download of
-- Prism EQ dropped straight in Effects while the Script Manager or FX Devices put it in its own
-- folder. Only a file with the same "desc:" line counts.
local function Desc(path)
  return ((ReadFile(path) or ''):match('^%s*desc:%s*([^\r\n]+)') or ''):gsub('%s+$', '')
end

local function LooseCopies()
  local list = {}
  for _, p in ipairs(S.products) do
    local file = p.kind ~= 'clap' and p.installedFile and ResPath(p.installedFile)
    local name = file and p.installedFile:match('([^/]+)$')
    local loose = name and NativePath(RES .. '/Effects/' .. name)
    if loose and loose ~= file and Exists(file) and Exists(loose) and Desc(loose) ~= '' and Desc(loose) == Desc(file) then
      list[#list + 1] = { path = loose, name = name, product = p.name }
    end
  end
  return list
end

-- the installed product this one comes with (Prism EQ and FX Devices' other JSFX, with FX Devices):
-- when its file is on disk, that one updates it, so it has no buttons of its own. Without the file
-- (FX Devices from 3.11 leaves these out) it installs on its own.
local function Parent(p)
  if not p.includedIn or not p.onDisk then return nil end
  for _, q in ipairs(S.products) do
    if q.id == p.includedIn and q.installed then return q end
  end
end

-- whether each product's own file (installedFile) is there; after loading and after each install
local function RefreshOnDisk()
  for _, p in ipairs(S.products) do
    p.onDisk = p.installedFile and Exists(ResPath(p.installedFile)) or false
  end
end

-- FX Devices' JSFX use FX Devices' license: the same key, status and releases
local function LicenseOwner(p)
  if not p.licenseOf then return nil end
  for _, q in ipairs(S.products) do
    if q.id == p.licenseOf then return q end
  end
end

local function ShareLicense(p)
  local q = LicenseOwner(p)
  if q then p.key, p.lic = q.key, q.lic end
end

-- newest release when there is one
local function Latest(p) return p.releases[1] and p.releases[1].tag or nil end

-- a license includes the releases published until its updates end (2 years per purchase); the
-- site marks the newer ones included = false
local function Included(rel) return rel and rel.included ~= false end

-- index of the newest release this license includes (1 for trials and older licenses)
local function NewestIncluded(p)
  for i, rel in ipairs(p.releases) do if Included(rel) then return i end end
  return nil
end

-- "18 Oct 2028" from the site's milliseconds
local function DateText(ms) return ms and os.date('%d %b %Y', math.floor(ms / 1000)) or '' end

-- the license's updates ended before the newest release came out
local function NeedsRenewal(p) return p.releases[1] ~= nil and not Included(p.releases[1]) end

local function UpdateAvailable(p)
  local i = NewestIncluded(p)
  local inst, latest = p.installed, i and p.releases[i].tag
  if Parent(p) then return false end
  if not inst or not latest or IsDev(inst) or inst == 'installed' then return false end
  return inst ~= latest
end

---------------------------------------------------------------------------------------------------
-- Licenses: each script is its own purchase, so each has its own key. The key lives where the
-- script itself reads it (its license ExtState section), so a key typed in either place counts.
---------------------------------------------------------------------------------------------------

local function StoredKey(p)
  local k = p.licenseSection and r.GetExtState(p.licenseSection, 'licenseKey') or ''
  if k == '' then k = r.GetExtState(EXT, 'key_' .. p.id) end
  if k == '' then k = r.GetExtState(EXT, 'licenseKey') end -- the 2.0 installer's one key
  return (k:gsub('%s', ''))
end

local function CheckLicense(p)
  if p.free then p.key, p.lic = '', { status = 'free' } return end
  p.key = StoredKey(p)
  p.keyInput = p.keyInput or p.key
  if p.key == '' then p.lic = { status = 'none' } return end
  local data, err, body = Api(VERIFY_URL, { licenseKey = p.key, product = p.id })
  if data and (data.status == 'active' or data.status == 'trial') then
    p.lic = { status = data.status, expiresAt = data.expiresAt, updatesUntil = data.updatesUntil }
  elseif not data and not body then
    -- offline: what the script last saw
    local st = p.licenseSection and r.GetExtState(p.licenseSection, 'status') or ''
    p.lic = { status = st ~= '' and st or 'none', offline = true }
  else
    local reason = (body and (body.reason or body.error)) or err
    -- the 2.0 installer's shared key may belong to the other script: then this one has none
    if tostring(reason):find('Each script needs its own license') and r.GetExtState(EXT, 'key_' .. p.id) == ''
      and (not p.licenseSection or r.GetExtState(p.licenseSection, 'licenseKey') == '') then
      p.key, p.keyInput, p.lic = '', '', { status = 'none' }
    else
      p.lic = { status = (body and body.status) or 'invalid', reason = reason }
    end
  end
end

local function Owned(p) return p.lic and p.lic.status == 'active' end
local function HasValidKey(p) return p.lic and (p.lic.status == 'active' or p.lic.status == 'trial' or p.lic.status == 'free') end

-- saves a key that verified for this product, for the manager and for the script
local function UseKey(p, key)
  p.key, p.keyInput = key, key
  r.SetExtState(EXT, 'key_' .. p.id, key, true)
  if p.licenseSection then
    r.SetExtState(p.licenseSection, 'licenseKey', key, true)
    if S.email ~= '' and r.GetExtState(p.licenseSection, 'email') == '' then
      r.SetExtState(p.licenseSection, 'email', S.email, true)
    end
  end
end

-- The script's own computer ID (made here when the script hasn't run on this computer yet), so
-- signing in here activates this computer for the script: no second sign-in when it starts.
local function DeviceId(p)
  if not p.licenseSection then return '' end
  local id = r.GetExtState(p.licenseSection, 'deviceId')
  if id ~= '' then return id end
  math.randomseed(os.time() + math.floor(r.time_precise() * 1000) % 100000)
  local chars, t = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', {}
  for i = 1, 16 do local n = math.random(1, #chars) t[i] = chars:sub(n, n) end
  math.randomseed()
  id = table.concat(t)
  r.SetExtState(p.licenseSection, 'deviceId', id, true)
  return id
end

-- "Sign in with browser": the site's /link page signs the person in (Google, password or an
-- emailed link), offers the free trial when they have no license, and this computer gets the key.
local function StopLink(p, kind, text)
  p.link = nil
  if text then p.msg = { kind = kind, text = text } end
end

local function StartLink(p)
  p.msg = nil
  local job = AsyncPost(LINK_URL, { action = 'link-start', product = p.id })
  if not job then return StopLink(p, 'err', 'Couldn\'t start the sign-in. Try again.') end
  p.link = { phase = 'starting', job = job, fails = 0 }
end

local function Linked(p, data)
  local key = tostring(data.licenseKey or ''):gsub('%s', '')
  if key == '' then return StopLink(p, 'err', 'The server sent an unexpected answer. Try again.') end
  p.link = nil
  if data.email and data.email ~= '' then
    S.email = data.email
    r.SetExtState(EXT, 'email', data.email, true)
  end
  UseKey(p, key)
  if p.licenseSection then
    r.SetExtState(p.licenseSection, 'email', S.email or '', true)
    r.SetExtState(p.licenseSection, 'lastCheck', '0', true) -- the script checks the new key on its next start
  end
  local st = data.licenseStatus == 'trial' and 'trial' or 'active'
  p.lic = { status = st, expiresAt = data.expiresAt }
  p.showKey = false
  p.msg = { kind = 'ok', text = st == 'active' and ('Signed in. Your ' .. p.name .. ' license is ready on this computer.')
    or ('Free trial ready: ' .. (DaysLeft(data.expiresAt) or 30) .. ' days of ' .. p.name .. '.') }
end

local function LinkAnswer(p, k, data)
  local now = os.time()
  if not data then -- no answer: try again a few times
    k.fails = k.fails + 1
    if k.phase == 'starting' or k.fails >= 15 then
      return StopLink(p, 'err', 'Couldn\'t reach coolreaperscripts.com. Check your internet connection and try again.')
    end
    k.nextPoll = now + 4
    return
  end
  k.fails = 0
  if k.phase == 'starting' then
    if not (data.deviceCode and data.userCode and data.url) then
      return StopLink(p, 'err', data.error or 'Sign-in isn\'t available right now. Try again in a moment.')
    end
    k.deviceCode, k.userCode, k.url = data.deviceCode, data.userCode, data.url
    k.phase, k.expires, k.nextPoll = 'waiting', now + (tonumber(data.expiresIn) or 600), now + 3
    OpenUrl(k.url)
    return
  end
  local st = data.status
  if st == 'linked' then return Linked(p, data)
  elseif st == 'limit' then k.phase, k.email, k.nextPoll = 'limit', data.email, now + 3
  elseif st == 'no-license' then k.phase, k.email, k.nextPoll = 'nolicense', data.email, now + 3
  elseif st == 'pending' then k.nextPoll = now + 2
  elseif st == 'error' then StopLink(p, 'err', data.error or 'Couldn\'t activate this computer. Try again.')
  elseif st == 'expired' then StopLink(p, 'warn', 'The sign-in link expired. Click Sign in with browser to try again.')
  else StopLink(p, 'err', data.error or 'The sign-in link isn\'t valid anymore. Click Sign in with browser to try again.') end
end

local function LinkTick(p)
  local k = p.link
  if not k then return end
  if k.job then
    local data = AsyncResult(k.job)
    if data == nil then return end
    k.job = nil
    return LinkAnswer(p, k, data)
  end
  local now = os.time()
  if k.expires and now > k.expires then
    return StopLink(p, 'warn', 'The sign-in link expired. Click Sign in with browser to try again.')
  end
  if k.nextPoll and now >= k.nextPoll then
    k.job = AsyncPost(LINK_URL, { action = 'link-poll', deviceCode = k.deviceCode, deviceId = DeviceId(p) })
    if not k.job then k.nextPoll = now + 4 end
  end
end

---------------------------------------------------------------------------------------------------
-- The Script Manager's own updates: the site's copy, when it's newer than this one
---------------------------------------------------------------------------------------------------

local MANAGER_URL = SITE .. '/assets/Download/Cool%20Reaper%20Script%20Manager.lua'

-- true when version a is newer than b ("3.12.0" > "3.11.2")
local function Newer(a, b)
  local ta, tb = {}, {}
  for n in tostring(a):gmatch('%d+') do ta[#ta + 1] = tonumber(n) end
  for n in tostring(b):gmatch('%d+') do tb[#tb + 1] = tonumber(n) end
  for i = 1, math.max(#ta, #tb) do
    if (ta[i] or 0) ~= (tb[i] or 0) then return (ta[i] or 0) > (tb[i] or 0) end
  end
  return false
end

-- downloads the site's copy; S.selfUpdate = { version, file, notes } when it's newer and loads
local function CheckManagerUpdate()
  if S.selfUpdate then os.remove(S.selfUpdate.file) end
  S.selfUpdate = nil
  local file = TempFile('manager.lua')
  -- a quick check: on a slow or dead connection it's skipped, not waited for
  if not Get(MANAGER_URL, file, 8) then return end
  local code = ReadFile(file) or ''
  local v = code:match("\nlocal VERSION = '([%d%.]+)'")
  if not (v and Newer(v, VERSION) and load(code)) then os.remove(file) return end
  -- what's new: its changelog entry, joined into one paragraph
  local notes, on = {}, false
  for line in code:gmatch('[^\n]+') do
    local ver, text = line:match('^%-%-%s+(%d[%d%.]*):%s*(.*)$')
    if ver then
      if on then break end
      on = ver == v
      if on then notes[#notes + 1] = text end
    elseif on then
      local more = line:match('^%-%-%s+(.*)$')
      if not more or line:match('^%-%- @') then break end
      notes[#notes + 1] = more
    end
  end
  S.selfUpdate = { version = v, file = file, notes = #notes > 0 and table.concat(notes, ' ') or nil }
end

-- puts the new copy where the scripts and the Actions list run it from, then reopens it
local function UpdateManager()
  local u = S.selfUpdate
  local data = u and ReadFile(u.file)
  if not data then S.msg = { kind = 'err', text = 'Couldn\'t read the downloaded Script Manager. Try again with Check for updates.' } return end
  local targets = { ManagerPath() }
  local _, self = r.get_action_context()
  if self and self ~= '' and Exists(self) and NativePath(self) ~= ManagerPath() then targets[#targets + 1] = self end
  for _, t in ipairs(targets) do
    r.RecursiveCreateDirectory(DirOf(t), 0)
    if not WriteFile(t, data) then S.msg = { kind = 'err', text = 'Couldn\'t write ' .. t .. '. Download the Script Manager from coolreaperscripts.com instead.' } return end
  end
  os.remove(u.file)
  S.selfUpdate = nil
  S.restart = ManagerPath()
  S.close = true
end

---------------------------------------------------------------------------------------------------
-- Loading the script list
---------------------------------------------------------------------------------------------------

local function LoadProducts()
  CheckManagerUpdate()
  local list, err = Api(API, { action = 'products', client = CLIENT, platform = PLATFORM })
  if not list then S.msg = { kind = 'err', text = err } S.loaded = true return end
  local old = {}
  for _, p in ipairs(S.products) do old[p.id] = p end
  S.products = {}
  for _, p in ipairs(list.products or {}) do
    local prev = old[p.id]
    if prev then p.keyInput, p.showKey, p.link, p.previewImg = prev.keyInput, prev.showKey, prev.link, prev.previewImg end
    -- a JSFX's GUI preview, downloaded once (a new picture gets a new name)
    if p.preview then
      r.RecursiveCreateDirectory(PREVIEW_DIR, 0)
      p.previewFile = PREVIEW_DIR .. SEP .. p.preview:match('([^/]+)$')
      if not Exists(p.previewFile) then Get(SITE .. p.preview, p.previewFile) end
      if prev and prev.previewFile ~= p.previewFile then p.previewImg = nil end
    end
    local owner = LicenseOwner(p)
    if owner then
      -- an FX Devices JSFX: FX Devices' license and releases (it ships in them), no requests of its own
      p.key, p.lic, p.releases, p.branch = owner.key, owner.lic, owner.releases, owner.branch
    else
      if p.licenseOf then p.key, p.lic = '', { status = 'none' } else CheckLicense(p) end
      -- with the key, the site says which releases the license includes
      local rel = Api(API, { action = 'releases', product = p.id, client = CLIENT, platform = PLATFORM, licenseKey = Owned(p) and p.key or nil })
      p.releases = {}
      for _, x in ipairs(rel and rel.releases or {}) do
        -- version-like tags only ("1.08", "v1.02", "Ver0.9"); a few early releases have none
        if not x.prerelease and tostring(x.tag):match('^%a*%d') then p.releases[#p.releases + 1] = x end
      end
      p.branch = rel and rel.branch or 'main'
    end
    -- newest release the license includes, or the development version when there are none
    p.choice = NewestIncluded(p) or #p.releases + 1
    p.installed = InstalledVersion(p)
    if p.installed and IsDev(p.installed) then p.choice = #p.releases + 1 end
    -- a script with no releases needs a key; show where to put it
    if #p.releases == 0 and not HasValidKey(p) and p.showKey == nil then p.showKey = true end
    S.products[#S.products + 1] = p
  end
  RefreshOnDisk()
  S.loaded = true
  S.loose = nil
end

---------------------------------------------------------------------------------------------------
-- Installing: one file per frame so the window keeps redrawing
---------------------------------------------------------------------------------------------------

local function ChosenRef(p)
  local rel = p.releases[p.choice]
  if rel then return rel.tag, 'Version ' .. rel.tag end
  return p.branch, 'Development version'
end

local function StartsWith(s, prefix) return s:sub(1, #prefix) == prefix end

-- the folders an install puts files in: the main script's folder, then routed ones (FX Devices'
-- JSFX go to Effects)
local function InstallFolders(p)
  local main = MainScriptPath(p)
  -- a product without a script (Prism EQ) only has its routed files to show
  local list = (main or not p.routes or #p.routes == 0) and { { label = 'Script', dir = main and DirOf(main) or NativePath(RES .. '/' .. p.installDir) } } or {}
  for _, rt in ipairs(p.routes or {}) do
    local dir = ResPath((rt.to:gsub('/+$', '')))
    list[#list + 1] = { label = rt.to:match('^Effects/') and 'JSFX (Effects folder)' or rt.to:match('^{CLAP}') and 'Plugin (CLAP folder)'
      or rt.to:match('^{VST3}') and 'Plugin (VST3 folder)' or 'Files', dir = dir }
  end
  return list
end

-- where a repo file goes: the main script under its installed name, routed folders (JSFX into
-- Effects), everything else under the script's folder
local function TargetFor(p, path)
  if p.mainScript and path == p.mainScript.from then return InstallPath(p, p.mainScript.to) end
  for _, rt in ipairs(p.routes or {}) do
    if StartsWith(path, rt.from) then return ResPath(rt.to .. path:sub(#rt.from + 1)) end
  end
  return InstallPath(p, path)
end

local function IsUserData(p, path)
  for _, u in ipairs(p.userData or {}) do
    if path == u or StartsWith(path, u .. '/') then return true end
  end
  return false
end

-- A developer's working copy (a git checkout, or a folder symlinked into one, like FX Devices'
-- JSFX folder on bryan's machine) must never be overwritten by a download.
local function IsSymlink(path)
  if IS_WIN then return false end
  local ok = os.execute('test -L ' .. ShellQuote(path))
  return ok == true or ok == 0
end

local function DevCheckoutIn(p)
  local dirs = { p.installDir }
  if p.mainScript then
    local sub = p.mainScript.to:match('^(.*)/[^/]*$')
    if sub then dirs[#dirs + 1] = p.installDir .. '/' .. sub end
  end
  for _, rt in ipairs(p.routes or {}) do
    local d = rt.to:gsub('/+$', '')
    while d and d:find('/') do
      dirs[#dirs + 1] = d
      d = d:match('^(.*)/[^/]*$')
    end
  end
  -- the repo's own main script sits next to the installed one only in a developer's folder
  -- (installs always rename it)
  if p.mainScript and p.mainScript.from ~= p.mainScript.to and Exists(InstallPath(p, p.mainScript.from)) then
    return NativePath(p.installDir)
  end
  for _, d in ipairs(dirs) do
    local full = NativePath(RES .. '/' .. d)
    if IsSymlink(full) or Exists(full .. SEP .. '.git' .. SEP .. 'HEAD') or Exists(full .. SEP .. '.git') then
      return NativePath(d)
    end
  end
end

-- Layout images: only the ones the layouts of installed plugins use. A layout is "<FX name>.ini" (the
-- FX name without its "VST3: " prefix); its backgrounds and attached drawings are left out when no
-- installed plugin has that name, and the script downloads one when a layout first needs it. Knobs,
-- switches and the other images always come: they're choices in the layout editor.
local LAYOUT_IMAGES = {
  ['fx-devices'] = {
    layouts = 'BryanChi_FX_Devices/src/FX Layouts',
    images = { 'BryanChi_FX_Devices/src/Images/Backgrounds/', 'BryanChi_FX_Devices/src/Images/Attached Drawings/' },
  },
}

local function IsLayoutImage(spec, path)
  for _, d in ipairs(spec.images) do
    if StartsWith(path, d) and not path:sub(#d + 1):find('/') then return true end
  end
  return false
end

-- installed FX by layout name (lowercase), nil when REAPER can't list them
local function InstalledFxNames()
  if not r.EnumInstalledFX then return nil end
  local names, i = {}, 0
  while true do
    local ok, name = r.EnumInstalledFX(i)
    if not ok then break end
    name = name:gsub('^%w+:%s*', ''):gsub('[%:%[%]%/]', '_')
    names[name:lower()] = true
    i = i + 1
  end
  return i > 0 and names or nil
end

-- Runs once the layouts are in: queues the held-back layout images the installed plugins need (and
-- every one already on disk, so those stay up to date)
local function QueueLayoutImages(job)
  local held, spec = job.images, LAYOUT_IMAGES[job.p.id]
  job.images, job.skipped = nil, 0
  local installed = InstalledFxNames()
  -- image name (lowercase) -> true when a layout to keep uses it, false when only skipped layouts do
  local used = {}
  if installed then
    local dir = TargetFor(job.p, spec.layouts)
    r.EnumerateFiles(dir, -1) -- re-read the folder
    local i = 0
    while true do
      local f = r.EnumerateFiles(dir, i)
      if not f then break end
      local name = f:match('^(.*)%.ini$')
      if name then
        -- only "Plugin (Vendor)" layouts are for plugins; FX Devices' own JSFX and the rest always keep theirs
        local keep = not name:match('%(.+%)$') or StartsWith(name, 'FXD') or installed[name:lower()] == true
        for img in (ReadFile(dir .. SEP .. f) or ''):gmatch('Image_?Path%s*=%s*([^\r\n]+)') do
          local base = img:gsub('%s+$', ''):match('([^/\\]+)$')
          if base then used[base:lower()] = used[base:lower()] or keep end
        end
      end
      i = i + 1
    end
  end
  for _, item in ipairs(held) do
    if used[item.path:match('([^/]+)$'):lower()] == false and not Exists(item.target) then
      job.skipped = job.skipped + 1
    else
      job.queue[#job.queue + 1] = item
    end
  end
end

-- What the last install put where: "<git sha>\t<repo path>" per line, so an update downloads only the
-- files that changed (the file list from the site carries each file's git sha)
local function ManifestPath(p) return InstallPath(p, '.crs_manifest') end

local function ReadManifest(p)
  local m = {}
  for sha, path in (ReadFile(ManifestPath(p)) or ''):gmatch('(%x+)\t([^\r\n]+)') do m[path] = sha end
  return m
end

local function WriteManifest(job)
  local m = job.manifest or {}
  for _, item in ipairs(job.queue) do
    -- a file the person kept their own version of isn't this version's
    m[item.path] = not (item.conflict and item.keep) and item.sha or nil
  end
  for _, f in ipairs(job.failed) do m[f.path] = nil end
  local lines = {}
  for path, sha in pairs(m) do lines[#lines + 1] = sha .. '\t' .. path end
  table.sort(lines)
  WriteFile(ManifestPath(job.p), table.concat(lines, '\n') .. '\n')
end

-- Git blob shas of files already on disk that the manifest doesn't vouch for (installs before 3.8,
-- ReaPack copies), so their first update skips the unchanged ones too. macOS and Linux only: one
-- shell run for all of them (a few seconds for FX Devices); Windows relies on the manifest.
local function HashFiles(items, manifest)
  local out = {}
  if IS_WIN then return out end
  local paths = {}
  for _, item in ipairs(items) do
    -- a different size is a different file: no need to hash it
    if item.sha and manifest[item.path] ~= item.sha and Exists(item.target) and FileSize(item.target) == item.size then
      paths[#paths + 1] = item.target
    end
  end
  if #paths == 0 then return out end
  local list, res, sh = TempFile('list.txt'), TempFile('hashes.txt'), TempFile('hash.sh')
  WriteFile(list, table.concat(paths, '\n') .. '\n')
  WriteFile(sh, [[#!/bin/sh
if command -v sha1sum >/dev/null 2>&1; then H='sha1sum'; elif command -v openssl >/dev/null 2>&1; then H='openssl sha1'; else H='shasum'; fi
while IFS= read -r f; do
  [ -f "$f" ] || continue
  s=$(wc -c < "$f" | tr -d ' ')
  h=$( { printf 'blob %s\000' "$s"; cat "$f"; } | $H | sed 's/.*\([0-9a-f]\{40\}\).*/\1/')
  printf '%s\t%s\n' "$h" "$f"
done < "$1" > "$2"
]])
  os.execute('/bin/sh ' .. ShellQuote(sh) .. ' ' .. ShellQuote(list) .. ' ' .. ShellQuote(res))
  for sha, path in (ReadFile(res) or ''):gmatch('(%x+)\t([^\r\n]+)') do out[path] = sha end
  os.remove(list) os.remove(res) os.remove(sh)
  return out
end

-- Git blob sha of a file on disk (SHA-1 of "blob <size>\0" and the bytes), as the site's file list
-- has it. Only for the few files an update changes, so plain Lua is quick enough.
local function Sha1(msg)
  local function rol(x, n) return ((x << n) | (x >> (32 - n))) & 0xFFFFFFFF end
  local h0, h1, h2, h3, h4 = 0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0
  local ml = #msg * 8
  msg = msg .. '\128' .. string.rep('\0', (55 - #msg) % 64) .. string.pack('>I8', ml)
  local w = {}
  for chunk = 1, #msg, 64 do
    for i = 0, 15 do w[i] = string.unpack('>I4', msg, chunk + i * 4) end
    for i = 16, 79 do w[i] = rol(w[i - 3] ~ w[i - 8] ~ w[i - 14] ~ w[i - 16], 1) end
    local a, b, c, d, e = h0, h1, h2, h3, h4
    for i = 0, 79 do
      local f, k
      if i < 20 then f, k = (b & c) | ((~b) & d), 0x5A827999
      elseif i < 40 then f, k = b ~ c ~ d, 0x6ED9EBA1
      elseif i < 60 then f, k = (b & c) | (b & d) | (c & d), 0x8F1BBCDC
      else f, k = b ~ c ~ d, 0xCA62C1D6 end
      a, b, c, d, e = (rol(a, 5) + (f & 0xFFFFFFFF) + e + k + w[i]) & 0xFFFFFFFF, a, rol(b, 30), c, d
    end
    h0, h1, h2, h3, h4 = (h0 + a) & 0xFFFFFFFF, (h1 + b) & 0xFFFFFFFF, (h2 + c) & 0xFFFFFFFF, (h3 + d) & 0xFFFFFFFF, (h4 + e) & 0xFFFFFFFF
  end
  return string.format('%08x%08x%08x%08x%08x', h0, h1, h2, h3, h4)
end

local function GitSha(path)
  local data = ReadFile(path)
  return data and Sha1('blob ' .. #data .. '\0' .. data)
end

local function AskIfChanged(p, path)
  for _, d in ipairs(p.askIfChanged or {}) do
    if StartsWith(path, d) then return true end
  end
  return false
end

-- Sorts an update's files before anything downloads. old = path -> sha of what's installed now (the
-- installed release's file list, or the manifest), nil when unknown. For files people edit (askIfChanged):
--   the update doesn't change it            -> left alone, edited or not
--   on disk as the installed version has it -> replaced
--   on disk as the new version has it       -> skipped
--   anything else (the person changed it)   -> a conflict: they choose keep theirs or take the new one
local function PlanEdits(p, items, old)
  local conflicts = {}
  if not old then return conflicts end
  for _, item in ipairs(items) do
    if item.sha and AskIfChanged(p, item.path) and Exists(item.target) then
      local o = old[item.path]
      if o == item.sha then
        item.keep = true
      else
        local h = GitSha(item.target)
        if h == item.sha then item.keep = true
        elseif h ~= o then conflicts[#conflicts + 1] = item end
      end
    end
  end
  return conflicts
end

-- true when the file on disk already is this version's
local function Unchanged(job, item)
  if item.keep then return true end
  if job.full or not item.sha or IsUserData(job.p, item.path) then return false end
  if job.manifest[item.path] == item.sha and FileSize(item.target) == item.size and Exists(item.target) then return true end
  return job.hashes[item.target] == item.sha
end

local function StartInstall(p)
  local dev = DevCheckoutIn(p)
  if dev then
    p.msg = { kind = 'warn', text = dev .. ' is a development checkout (a git folder or a link to one), so the Script Manager won\'t install over it.' }
    return
  end
  local ref, label = ChosenRef(p)
  -- every download needs a license or trial key (the site stamps each copy with the key it went to)
  ShareLicense(p)
  if not HasValidKey(p) then
    local owner = LicenseOwner(p)
    if owner then
      owner.showKey = true
      p.msg = { kind = 'info', text = p.name .. ' comes with an FX Devices license or trial. Sign in on the ' .. owner.name
        .. ' card above (no license yet? the sign-in page starts your free 30-day trial), then install it here.' }
      return
    end
    p.showKey = true
    p.msg = { kind = 'info', text = 'Sign in to install ' .. p.name .. '. No license yet? The sign-in page starts your free 30-day trial.' }
    return
  end
  local list, err = Api(API, { action = 'files', product = p.id, client = CLIENT, platform = PLATFORM, licenseKey = p.key, ref = ref })
  if not list then p.msg = { kind = 'err', text = Friendly(err) } return end
  local queue, spec = {}, LAYOUT_IMAGES[p.id]
  -- layout images wait until the layouts are in (QueueLayoutImages)
  local images = spec and {} or nil
  -- JSFX that are their own items (FX Devices' effects): only the ones already on disk, to update them
  local optional = {}
  for _, path in ipairs(p.optional or {}) do optional[path] = true end
  for _, f in ipairs(list.files or {}) do
    local target = TargetFor(p, f.path)
    if not (IsUserData(p, f.path) and Exists(target)) and not (optional[f.path] and not Exists(target)) then
      local item = { path = f.path, target = target, size = f.size, sha = f.sha }
      if images and IsLayoutImage(spec, f.path) then images[#images + 1] = item else queue[#queue + 1] = item end
    end
  end
  if #queue == 0 then p.msg = { kind = 'err', text = 'Nothing to install.' } return end
  p.msg = nil
  -- reinstalling the installed release downloads everything (a repair); otherwise files already on
  -- disk as they are in this version stay
  local full = ref ~= p.branch and ref == p.installed
  local all = {}
  for _, item in ipairs(queue) do all[#all + 1] = item end
  for _, item in ipairs(images or {}) do all[#all + 1] = item end
  local manifest = ReadManifest(p)
  -- what's installed now: the installed release's own file list, else what the last install wrote
  local old
  if not full and p.installed and p.installed ~= 'installed' and not IsDev(p.installed) then
    local was = Api(API, { action = 'files', product = p.id, client = CLIENT, platform = PLATFORM, licenseKey = p.key, ref = p.installed })
    if was and was.files then
      old = {}
      for _, f in ipairs(was.files) do old[f.path] = f.sha end
    end
  end
  if not old and next(manifest) then old = manifest end
  local job = { p = p, ref = ref, label = label, queue = queue, images = images, n = 0, failed = {}, unchanged = 0,
    manifest = manifest, hashes = not full and HashFiles(all, manifest) or {}, full = full }
  -- a file two products share (Prism EQ, which FX Devices ships too) may be there from the other
  -- one: its own sha says whether it's already this version (skipped) or older (updated)
  for _, q in ipairs(S.products) do
    local shared = q.installedFile and ResPath(q.installedFile)
    for _, item in ipairs(shared and not full and all or {}) do
      if item.target == shared and not job.hashes[shared] and Exists(shared) then job.hashes[shared] = GitSha(shared) end
    end
  end
  local conflicts = not full and PlanEdits(p, all, old) or {}
  if #conflicts > 0 then
    -- ask first (ConflictPanel); each starts as "keep mine"
    for _, c in ipairs(conflicts) do c.keep, c.conflict = true, true end
    p.ask = { job = job, conflicts = conflicts }
    return
  end
  S.job = job
end

-- A finished download of one queue item (in item.target .. '.download'): put it in place or note why not
local function PlaceDownload(job, item, code, err)
  local tmp = item.target .. '.download'
  local data = ReadFile(tmp)
  if code == 200 and data and (#data > 0 or (item.size or 0) == 0) then
    if not os.remove(item.target) and Exists(item.target) then
      -- a plugin REAPER has loaded (Windows locks it): moved aside, the new one takes its place and
      -- REAPER loads that from its next start; the old one goes on the next install
      os.remove(item.target .. '.old')
      os.rename(item.target, item.target .. '.old')
    end
    if os.rename(tmp, item.target) then return end
    err = 'could not replace the file (is it open somewhere?)'
  end
  os.remove(tmp)
  local why = err
  if not why or why == '' then
    local j = data and JsonDecode(data)
    why = (type(j) == 'table' and j.error) or ('HTTP ' .. tostring(code))
  end
  job.failed[#job.failed + 1] = { path = item.path, why = why }
end

-- one file, one request (curl without --parallel, older than 7.66)
local function InstallOne(job, item)
  r.RecursiveCreateDirectory(DirOf(item.target), 0)
  os.remove(item.target .. '.download')
  local code, _, err = Post(API, { action = 'download', product = job.p.id, client = CLIENT, platform = PLATFORM, licenseKey = job.p.key, path = item.path, ref = job.ref }, item.target .. '.download')
  PlaceDownload(job, item, code, err)
end

-- Each request waits on the site (license check, then GitHub) for most of a second, so files come
-- PARALLEL at a time, BATCH per curl run: one curl config with a transfer per file, in the
-- background (the window keeps drawing).
local PARALLEL = 8
local BATCH = 32

local CurlQuote = BG.Quote

local function StartBatch(job, items)
  local b = { items = items }
  local lines = { 'parallel', 'parallel-max = ' .. PARALLEL, 'silent' }
  for i, item in ipairs(items) do
    r.RecursiveCreateDirectory(DirOf(item.target), 0)
    os.remove(item.target .. '.download')
    if i > 1 then lines[#lines + 1] = 'next' end
    local body = JsonEncode({ action = 'download', product = job.p.id, client = CLIENT, platform = PLATFORM, licenseKey = job.p.key, path = item.path, ref = job.ref })
    lines[#lines + 1] = 'url = ' .. CurlQuote(API)
    lines[#lines + 1] = 'request = "POST"'
    lines[#lines + 1] = 'header = "Content-Type: application/json"'
    lines[#lines + 1] = 'data-binary = ' .. CurlQuote(body)
    lines[#lines + 1] = 'output = ' .. CurlQuote(item.target .. '.download')
    lines[#lines + 1] = 'location'
    lines[#lines + 1] = 'silent'
    lines[#lines + 1] = BG.CONNECT
    lines[#lines + 1] = 'max-time = 120'
    lines[#lines + 1] = 'write-out = "%{http_code}\\t%{filename_effective}\\n"'
  end
  b.job = BG.Spawn(lines, 900)
  return b.job and b or nil
end

-- nil while the batch runs; then places its files (true), or false when this curl can't do it
local function PollBatch(job, b)
  local printed = BG.Poll(b.job)
  if printed == nil then return nil end
  local codes = {}
  for code, file in printed:gmatch('(%d%d%d)\t([^\r\n]+)') do codes[file] = tonumber(code) end
  if next(codes) == nil then
    for _, item in ipairs(b.items) do os.remove(item.target .. '.download') end
    return false
  end
  for _, item in ipairs(b.items) do
    local code = codes[item.target .. '.download']
    PlaceDownload(job, item, code ~= 0 and code or nil, code == nil and 'no answer' or nil)
  end
  return true
end

-- One step of an install, once per frame: skip what's already there, run a batch or wait on it
local function InstallNext(job)
  if job.batch then
    local ok = PollBatch(job, job.batch)
    if ok == nil then return end
    if ok == false then job.noBatch, job.redo = true, job.batch.items end -- redo those one by one
    job.batch = nil
    return
  end
  if job.redo and #job.redo > 0 then InstallOne(job, table.remove(job.redo, 1)) return end
  local items = {}
  while job.n < #job.queue and #items < (job.noBatch and 1 or BATCH) do
    local item = job.queue[job.n + 1]
    job.n = job.n + 1
    if Unchanged(job, item) then job.unchanged = job.unchanged + 1 else items[#items + 1] = item end
  end
  if #items == 0 then return end
  if job.noBatch then InstallOne(job, items[1]) return end
  job.batch = StartBatch(job, items)
  if not job.batch then job.noBatch, job.redo = true, items end
end

local function InstallBusy(job) return job.n < #job.queue or job.batch ~= nil or (job.redo ~= nil and #job.redo > 0) end

local function FinishInstall(job)
  if job.images then
    QueueLayoutImages(job)
    if job.n < #job.queue then return end
  end
  local p = job.p
  -- a product without a script (Prism EQ) puts nothing else in its folder
  r.RecursiveCreateDirectory(NativePath(RES .. '/' .. p.installDir), 0)
  WriteManifest(job)
  local main = MainScriptPath(p)
  if main and Exists(main) then r.AddRemoveReaScript(true, 0, main, true) end
  -- the scripts' own updaters read the installed release from version.txt
  if job.ref ~= p.branch then
    WriteFile(InstallPath(p, 'version.txt'), 'release: ' .. job.ref .. '\n')
  end
  r.SetExtState(EXT, 'installed_' .. p.id, job.ref ~= p.branch and job.ref or 'development version', true)
  -- the script activates this computer with these on its first start (no key typing needed)
  if p.licenseSection and p.key ~= '' and r.GetExtState(p.licenseSection, 'licenseKey') == '' then
    r.SetExtState(p.licenseSection, 'licenseKey', p.key, true)
    if S.email ~= '' then r.SetExtState(p.licenseSection, 'email', S.email, true) end
  end
  p.installed = InstalledVersion(p)
  local ok = #job.failed == 0
  -- what this one replaces (Prism EQ's discontinued JSFX), once it's in
  local removed = 0
  for _, rel in ipairs(ok and p.replaces or {}) do
    -- never in a developer's working copy (FX Devices' JSFX folder linked into a git checkout)
    local file, linked = ResPath(rel), false
    local d = DirOf(file)
    while d and #d > #RES do
      if IsSymlink(d) or Exists(d .. SEP .. '.git') then linked = true break end
      d = DirOf(d)
    end
    if not linked and Exists(file) and os.remove(file) then removed = removed + 1 end
  end
  local lines = {}
  for i, f in ipairs(job.failed) do
    if i > 4 then lines[#lines + 1] = '...' break end
    lines[#lines + 1] = f.path .. ': ' .. tostring(f.why):sub(1, 100)
  end
  local skipped = (job.skipped or 0) > 0
    and ('; ' .. job.skipped .. ' layout images of plugins you don\'t have are left out, ' .. p.name .. ' downloads them if you get those plugins') or ''
  local action = main and Exists(main) and (' It\'s in the Action List as "Script: ' .. main:match('([^/\\]+)$') .. '".') or ''
  local fx = not main and p.installedFile and p.installedFile:match('([^/]+)%.jsfx$')
  local plugin = not main and p.kind == 'clap' and p.installedFile and p.installedFile:match('([^/]+)%.clap')
  -- its VST3, when this release has one (the routes say where it went)
  local vst3 = plugin and p.vst3InstalledFile and Exists(ResPath(p.vst3InstalledFile))
  local vst3Path = vst3 and VST3.needsPath and (' Add ' .. VST3.Dir() .. ' to Preferences > Plug-ins > VST > VST plug-in paths so REAPER finds the VST3'
      .. ' (Common Files\\VST3 needs admin rights here).') or ''
  p.msg = ok and plugin and { kind = 'ok', text = job.label .. ' installed. Restart REAPER (or click Re-scan in Preferences > Plug-ins > '
      .. (vst3 and 'CLAP and VST' or 'CLAP') .. '), then add it from the FX browser: "CLAP: ' .. plugin .. '"'
      .. (vst3 and (' or "VST3: ' .. plugin .. '"') or '') .. '.' .. vst3Path .. (removed > 0 and (' The old ' .. p.name .. ' JSFX is removed: projects that used it need the plugin added instead.') or '')
      .. ' Open the Script Manager again to update it.', folders = InstallFolders(p) }
    or ok and fx and { kind = 'ok', text = job.label .. ' installed. Add it to a track from the FX browser: "JS: ' .. fx
      .. '". Open the Script Manager again to update it.', folders = InstallFolders(p) }
    or ok and { kind = 'ok', text = job.label .. ' installed (' .. (job.unchanged > 0 and ((#job.queue - job.unchanged) .. ' files downloaded, ' .. job.unchanged .. ' already up to date')
      or (#job.queue .. ' files')) .. skipped .. ').' .. action .. ' To update it or get other scripts later, open '
      .. p.name .. '\'s settings and click Scripts and updates. You won\'t need the downloaded Script Manager again.', folders = InstallFolders(p) }
    or { kind = 'warn', text = ('Installed %d of %d files; %d failed. Install again to retry.\n'):format(#job.queue - #job.failed, #job.queue, #job.failed) .. table.concat(lines, '\n') }
  S.job = nil
  S.loose = nil
  RefreshOnDisk()
end

-- one step of the install, once per frame (a file fetched one at a time waits in the background)
BG.InstallStep = BG.Stepped(function(job)
  if InstallBusy(job) then InstallNext(job) else FinishInstall(job) end
end)

-- "Update all" and "Install all": the next one once nothing else runs or waits on a question
local function QueueTick()
  if not S.updateAll or S.job or S.busy then return end
  for _, p in ipairs(S.products) do if p.ask then return end end
  local p = table.remove(S.updateAll, 1)
  if not p then S.updateAll = nil return end
  Busy('Getting the file list...', function() StartInstall(p) end)
end

local function RunScript(p)
  local main = MainScriptPath(p)
  if not (main and Exists(main)) then return end
  local cmd = r.AddRemoveReaScript(true, 0, main, true)
  if cmd and cmd ~= 0 then
    r.Main_OnCommand(cmd, 0)
    S.close = true
  end
end

---------------------------------------------------------------------------------------------------
-- The Monolith look (FX Devices' settings window, after the website): black, hairlines, square
-- corners, letter-spaced mono caps, Anton titles with a chrome sheen, one green accent.
---------------------------------------------------------------------------------------------------

local ctx = im.CreateContext(TITLE)

-- 0xRRGGBBAA, from the site: --page #000, --acc #49cc85, --ink #f2f2f2 / #9a9a9a / #5f5f5f,
-- --line rgba(255,255,255,.12) / .2
local P = {
  page = 0x000000FF, card = 0x0A0A0AFF, acc = 0x49CC85FF, accHvr = 0x5FDA97FF,
  ink = 0xF2F2F2FF, ink2 = 0x9A9A9AFF, ink3 = 0x5F5F5FFF,
  line = 0xFFFFFF1F, line2 = 0xFFFFFF33, soft = 0xFFFFFF12, guide = 0xFFFFFF0B,
  amber = 0xF6C344FF, red = 0xEF5A5AFF, blue = 0x72A8FFFF,
}

local function A(c, a) return (c & 0xFFFFFF00) | (math.floor(a) & 0xFF) end
local function Mix(a, b, t)
  local function ch(c, s) return (c >> s) & 0xFF end
  local function m(s) return math.floor(ch(a, s) + (ch(b, s) - ch(a, s)) * t + 0.5) end
  return (m(24) << 24) | (m(16) << 16) | (m(8) << 8) | m(0)
end

local F = { body = im.CreateFont('sans-serif', 13), bodyB = im.CreateFont('sans-serif', 13, im.FontFlags_Bold) }
local function LoadFont(key, file, sz)
  local path = FONT_DIR .. SEP .. file
  if Exists(path) then F[key] = im.CreateFont(path, sz) end
end
for _, sz in ipairs({ 18, 22, 26, 36 }) do LoadFont('anton' .. sz, 'Anton-Regular.ttf', sz) end
for _, sz in ipairs({ 10, 11, 13 }) do
  LoadFont('mono' .. sz, 'JetBrainsMono-Medium.ttf', sz)
  LoadFont('monoB' .. sz, 'JetBrainsMono-SemiBold.ttf', sz)
end
for _, sz in ipairs({ 18, 22, 26, 36 }) do F['antonFB' .. sz] = F['anton' .. sz] or im.CreateFont('sans-serif', math.min(sz, 22), im.FontFlags_Bold) end
for _, sz in ipairs({ 10, 11, 13 }) do
  F['monoF' .. sz] = F['mono' .. sz] or im.CreateFont('monospace', sz)
  F['monoBF' .. sz] = F['monoB' .. sz] or im.CreateFont('monospace', sz, im.FontFlags_Bold)
end
local attached = {}
for _, f in pairs(F) do
  if not attached[f] then im.Attach(ctx, f) attached[f] = true end
end

-- the fonts EnsureFonts started downloading: used once they're all in (a font that can't be
-- attached now keeps the fallback until the next start)
function BG.FontsTick()
  if not BG.fonts or #BG.fonts == 0 then return end
  for i = #BG.fonts, 1, -1 do
    if GetPoll(BG.fonts[i]) ~= nil then table.remove(BG.fonts, i) end
  end
  if #BG.fonts > 0 then return end
  local prev = {}
  for k, v in pairs(F) do prev[k] = v end
  for _, sz in ipairs({ 18, 22, 26, 36 }) do
    if not F['anton' .. sz] then LoadFont('anton' .. sz, 'Anton-Regular.ttf', sz) end
    F['antonFB' .. sz] = F['anton' .. sz] or F['antonFB' .. sz]
  end
  for _, sz in ipairs({ 10, 11, 13 }) do
    if not F['mono' .. sz] then LoadFont('mono' .. sz, 'JetBrainsMono-Medium.ttf', sz) end
    if not F['monoB' .. sz] then LoadFont('monoB' .. sz, 'JetBrainsMono-SemiBold.ttf', sz) end
    F['monoF' .. sz] = F['mono' .. sz] or F['monoF' .. sz]
    F['monoBF' .. sz] = F['monoB' .. sz] or F['monoBF' .. sz]
  end
  for k, f in pairs(F) do
    if f ~= prev[k] and not attached[f] then
      if pcall(im.Attach, ctx, f) then attached[f] = true else F[k] = prev[k] end
    end
  end
end
local function F_Anton(sz) return F['antonFB' .. sz] end
local function F_Mono(sz, bold) return F[(bold and 'monoBF' or 'monoF') .. sz] end
-- the fallback fonts are smaller than asked; draw them at their own size
local function FontSize(font, sz)
  if font == F['antonFB' .. sz] and not F['anton' .. sz] then return math.min(sz, 22) end
  return sz
end

local WCache = {}
local function TextW(s, font)
  local k = tostring(font) .. s
  local w = WCache[k]
  if not w then
    im.PushFont(ctx, font)
    w = im.CalcTextSize(ctx, s)
    im.PopFont(ctx)
    WCache[k] = w
  end
  return w
end

local function Txt(dl, font, sz, x, y, c, s) im.DrawList_AddTextEx(dl, font, FontSize(font, sz), x, y, c, s) end

-- letter-spaced caps (the site's mono labels)
local function Mono_Caps(dl, sz, x, y, c, s, bold)
  local font, sp = F_Mono(sz, bold), sz * 0.12
  for _, cp in utf8.codes(tostring(s):upper()) do
    local ch = utf8.char(cp)
    Txt(dl, font, sz, x, y, c, ch)
    x = x + TextW(ch, font) + sp
  end
  return x - sp
end
local function Mono_Caps_W(sz, s, bold)
  local font, sp, w, n = F_Mono(sz, bold), sz * 0.12, 0, 0
  for _, cp in utf8.codes(tostring(s):upper()) do w = w + TextW(utf8.char(cp), font); n = n + 1 end
  return w + math.max(0, n - 1) * sp
end

-- display text with the site's chrome sheen, painted in vertical bands
local CHROME = { { 0, 0x6B6B6BFF }, { .22, 0xF5F5F5FF }, { .38, 0x8A8A8AFF }, { .52, 0xFFFFFFFF }, { .70, 0x707070FF }, { 1, 0xE8E8E8FF } }
local function Chrome_At(t)
  for i = 2, #CHROME do
    local a, b = CHROME[i - 1], CHROME[i]
    if t <= b[1] then return Mix(a[2], b[2], (t - a[1]) / (b[1] - a[1])) end
  end
  return CHROME[#CHROME][2]
end
local function Chrome_Text(dl, font, sz, x, y, s)
  local w = TextW(s, font)
  local BANDS = 28
  local bw = w / BANDS
  for i = 0, BANDS - 1 do
    im.DrawList_PushClipRect(dl, x + i * bw, y - 2, x + (i + 1) * bw + 0.5, y + sz * 1.5, true)
    Txt(dl, font, sz, x, y, Chrome_At((i + 0.5) / BANDS), s)
    im.DrawList_PopClipRect(dl)
  end
  return w
end

-- split s into lines no wider than w (words are never broken)
local function Wrap(s, font, w)
  local lines = {}
  for para in (tostring(s) .. '\n'):gmatch('(.-)\n') do
    local cur = ''
    for word in para:gmatch('%S+') do
      local cand = cur == '' and word or (cur .. ' ' .. word)
      if cur ~= '' and TextW(cand, font) > w then
        lines[#lines + 1] = cur
        cur = word
      else
        cur = cand
      end
    end
    lines[#lines + 1] = cur
  end
  return lines
end

local function Hand() im.SetMouseCursor(ctx, im.MouseCursor_Hand) end

-- reserve w x h at x, y as an invisible button
local function Hit(id, x, y, w, h, disabled)
  im.SetCursorScreenPos(ctx, x, y)
  local clicked = im.InvisibleButton(ctx, id, math.max(1, w), math.max(1, h))
  if disabled then return false, false, false end
  local hov, held = im.IsItemHovered(ctx), im.IsItemActive(ctx)
  if hov then Hand() end
  return clicked, hov, held
end

local BTN_H = 30
local function Btn_W(label) return Mono_Caps_W(10, label, true) + 32 end
-- kind 'go' = white fill (green on hover), 'buy' = green fill, otherwise the site's ghost button
local function Btn(id, label, x, y, kind, w, disabled)
  local dl = im.GetWindowDrawList(ctx)
  w = w or Btn_W(label)
  local clicked, hov, held = Hit(id, x, y, w, BTN_H, disabled)
  local tc
  if disabled then
    im.DrawList_AddRect(dl, x, y, x + w, y + BTN_H, P.soft)
    tc = P.ink3
  elseif kind == 'go' then
    im.DrawList_AddRectFilled(dl, x, y, x + w, y + BTN_H, (hov or held) and P.acc or 0xFFFFFFFF)
    tc = 0x000000FF
  elseif kind == 'buy' then
    im.DrawList_AddRectFilled(dl, x, y, x + w, y + BTN_H, (hov or held) and P.accHvr or P.acc)
    tc = 0x000000FF
  else
    if held then im.DrawList_AddRectFilled(dl, x, y, x + w, y + BTN_H, 0xFFFFFF14) end
    im.DrawList_AddRect(dl, x, y, x + w, y + BTN_H, hov and 0xFFFFFF80 or P.line2)
    tc = P.ink
  end
  local yo = held and 1 or 0
  Mono_Caps(dl, 10, x + (w - Mono_Caps_W(10, label, true)) / 2, y + (BTN_H - 10) / 2 - 1 + yo, tc, label, true)
  return clicked
end

-- status badge: mono caps in the status colour, square outline
local BADGE_H = 20
local function Badge_W(label) return Mono_Caps_W(10, label, true) + 16 end
local function Badge(dl, x, y, label, c)
  local w = Badge_W(label)
  im.DrawList_AddRectFilled(dl, x, y, x + w, y + BADGE_H, A(c, 0x14))
  im.DrawList_AddRect(dl, x, y, x + w, y + BADGE_H, A(c, 0x80))
  Mono_Caps(dl, 10, x + 8, y + (BADGE_H - 10) / 2 - 1, c, label, true)
  return w
end

-- mono caps text link; returns clicked
local function Link(id, dl, x, y, label, c)
  local w = Mono_Caps_W(10, label, true)
  local clicked, hov = Hit(id, x, y - 2, w, 14)
  Mono_Caps(dl, 10, x, y, hov and P.ink or (c or P.ink2), label, true)
  if hov then im.DrawList_AddLine(dl, x, y + 12, x + w, y + 12, P.ink, 1) end
  return clicked, w
end

-- "01  SCRIPTS": green Anton number + letter-spaced mono caps (the site's .kicker)
local function Kicker(dl, x, y, n, txt)
  local num = string.format('%02d', n)
  Txt(dl, F_Anton(18), 18, x, y, P.acc, num)
  Mono_Caps(dl, 10, x + TextW(num, F_Anton(18)) + 10, y + 5, P.ink2, txt)
end

local function Spinner(dl, x, y, text)
  local t = im.GetTime(ctx)
  for i = 0, 2 do
    local a = 0.25 + 0.75 * math.max(0, math.sin(t * 5 - i * 0.8))
    im.DrawList_AddRectFilled(dl, x + i * 9, y + 3, x + i * 9 + 5, y + 8, A(P.acc, a * 255))
  end
  Mono_Caps(dl, 10, x + 36, y, P.ink2, text)
end

-- a message: tinted box with a coloured edge, wrapped text; returns its height
local function Banner_H(text, w) return #Wrap(text, F.body, w - 28) * 16 + 18 end
local function Banner(dl, x, y, w, kind, text)
  local color = (kind == 'err' and P.red) or (kind == 'ok' and P.acc) or (kind == 'warn' and P.amber) or P.blue
  local lines = Wrap(text, F.body, w - 28)
  local h = #lines * 16 + 18
  im.DrawList_AddRectFilled(dl, x, y, x + w, y + h, A(color, 0x12))
  im.DrawList_AddRect(dl, x, y, x + w, y + h, A(color, 0x55))
  im.DrawList_AddRectFilled(dl, x, y, x + 2, y + h, color)
  for i, l in ipairs(lines) do Txt(dl, F.body, 13, x + 14, y + 9 + (i - 1) * 16, P.ink, l) end
  return h
end

-- the site's logo mark: a device with its title column and a knob, 30 px
local function Logo_Mark(dl, x, y)
  local s = 30 / 34
  local function X(v) return x + v * s end
  local function Y(v) return y + v * s end
  im.DrawList_AddRectFilled(dl, X(1.5), Y(3.5), X(32.5), Y(30.5), 0x1A1C20FF, 5 * s)
  im.DrawList_AddRectFilled(dl, X(1.5), Y(3.5), X(10.5), Y(30.5), 0x25282EFF, 5 * s, im.DrawFlags_RoundCornersLeft)
  im.DrawList_AddRect(dl, X(1.5), Y(3.5), X(32.5), Y(30.5), 0xFFFFFF24, 5 * s)
  im.DrawList_AddCircle(dl, X(6), Y(9), 2.2 * s, P.acc, 0, 1.2)
  local cx, cy, rr = X(22), Y(18.4), 5.6 * s
  im.DrawList_PathArcTo(dl, cx, cy, rr, math.pi * 0.75, math.pi * 2.25)
  im.DrawList_PathStroke(dl, 0x0C0D10FF, 0, 2.2 * s)
  im.DrawList_PathArcTo(dl, cx, cy, rr, math.pi * 0.75, math.pi * 1.45)
  im.DrawList_PathStroke(dl, P.acc, 0, 2.2 * s)
  im.DrawList_AddCircleFilled(dl, cx, cy, 3.2 * s, 0x2C2F36FF)
end

-- the knob ring from the site's hero, as a corner ornament
local function Ring(dl, cx, cy, rad)
  im.DrawList_AddCircle(dl, cx, cy, rad * 1.2, 0xFFFFFF0F, 64, 1)
  for k = 0, 59 do
    local a = k / 60 * math.pi * 2
    local r1, r2 = rad - 3, rad + 3
    im.DrawList_AddLine(dl, cx + math.cos(a) * r1, cy + math.sin(a) * r1, cx + math.cos(a) * r2, cy + math.sin(a) * r2, 0xFFFFFF1C, 1)
  end
  im.DrawList_PathArcTo(dl, cx, cy, rad, math.pi * 0.75, math.pi * 1.6, 40)
  im.DrawList_PathStroke(dl, A(P.acc, 0x99), 0, 1.5)
  im.DrawList_AddCircle(dl, cx, cy, rad * 0.78, 0xFFFFFF0D, 64, 1)
  local a = math.pi * 1.6
  im.DrawList_AddLine(dl, cx + math.cos(a) * rad * 0.38, cy + math.sin(a) * rad * 0.38,
    cx + math.cos(a) * rad * 0.72, cy + math.sin(a) * rad * 0.72, 0xFFFFFF5A, 1.6)
end

-- a card's background with the green corner ticks
local function Card_Bg(dl, x, y, w, h)
  im.DrawList_AddRectFilled(dl, x, y, x + w, y + h, P.card)
  im.DrawList_AddRect(dl, x, y, x + w, y + h, P.line)
  local t = 6
  for _, c in ipairs({ { x, y, 1, 1 }, { x + w, y, -1, 1 }, { x, y + h, 1, -1 }, { x + w, y + h, -1, -1 } }) do
    im.DrawList_AddLine(dl, c[1], c[2], c[1] + t * c[3], c[2], P.acc, 1)
    im.DrawList_AddLine(dl, c[1], c[2], c[1], c[2] + t * c[4], P.acc, 1)
  end
end

-- ImGui widgets (inputs, the version list) dressed to match: square, black, hairline border
local function Widgets_Push()
  im.PushStyleVar(ctx, im.StyleVar_FrameRounding, 0)
  im.PushStyleVar(ctx, im.StyleVar_FramePadding, 8, 7)
  im.PushStyleVar(ctx, im.StyleVar_FrameBorderSize, 1)
  im.PushStyleVar(ctx, im.StyleVar_PopupRounding, 0)
  im.PushStyleVar(ctx, im.StyleVar_PopupBorderSize, 1)
  im.PushStyleColor(ctx, im.Col_FrameBg, 0x000000FF)
  im.PushStyleColor(ctx, im.Col_FrameBgHovered, 0x111111FF)
  im.PushStyleColor(ctx, im.Col_FrameBgActive, 0x111111FF)
  im.PushStyleColor(ctx, im.Col_PopupBg, 0x0A0A0AFF)
  im.PushStyleColor(ctx, im.Col_Header, 0xFFFFFF14)
  im.PushStyleColor(ctx, im.Col_HeaderHovered, 0xFFFFFF1F)
  im.PushStyleColor(ctx, im.Col_HeaderActive, A(P.acc, 0x55))
  im.PushStyleColor(ctx, im.Col_Button, 0x000000FF)
  im.PushStyleColor(ctx, im.Col_ButtonHovered, 0x111111FF)
  im.PushStyleColor(ctx, im.Col_Text, P.ink)
  im.PushStyleColor(ctx, im.Col_TextSelectedBg, A(P.acc, 0x55))
end
local function Widgets_Pop()
  im.PopStyleColor(ctx, 11)
  im.PopStyleVar(ctx, 5)
end

---------------------------------------------------------------------------------------------------
-- Window parts
---------------------------------------------------------------------------------------------------

local HEADER_H, PAD, CARD_PX, CARD_PY = 62, 28, 18, 16
local CardH = {}

local function Header(dl, x, y, w)
  im.DrawList_AddLine(dl, x, y + HEADER_H, x + w, y + HEADER_H, P.line, 1)
  Logo_Mark(dl, x + 20, y + (HEADER_H - 30) / 2)
  local tx = x + 62
  local fa = F_Anton(22)
  Txt(dl, fa, 22, tx, y + (HEADER_H - 22) / 2 - 3, P.ink, 'COOL REAPER SCRIPTS')
  local sx = tx + TextW('COOL REAPER SCRIPTS', fa) + 14
  im.DrawList_AddLine(dl, sx, y + 22, sx, y + HEADER_H - 22, P.line2, 1)
  Mono_Caps(dl, 11, sx + 14, y + (HEADER_H - 11) / 2 - 1, P.ink2, 'Script Manager')

  -- close
  local cs = 30
  local cx, cy = x + w - 18 - cs, y + (HEADER_H - cs) / 2
  local clicked, hov = Hit('##close', cx, cy, cs, cs)
  im.DrawList_AddRect(dl, cx, cy, cx + cs, cy + cs, hov and 0xFFFFFF80 or P.line2)
  local cc, k = hov and P.ink or P.ink2, 4.5
  im.DrawList_AddLine(dl, cx + cs / 2 - k, cy + cs / 2 - k, cx + cs / 2 + k, cy + cs / 2 + k, cc, 1.4)
  im.DrawList_AddLine(dl, cx + cs / 2 + k, cy + cs / 2 - k, cx + cs / 2 - k, cy + cs / 2 + k, cc, 1.4)
  if clicked then S.close = true end

  -- update all, right to left from the close button
  local rx = cx - 12
  local pending = {}
  for _, p in ipairs(S.products) do if UpdateAvailable(p) then pending[#pending + 1] = p end end
  if #pending > 0 and not S.job and not S.busy and not S.updateAll then
    local label = 'Update all (' .. #pending .. ')'
    local bw = Btn_W(label)
    if Btn('##updall', label, rx - bw, y + (HEADER_H - BTN_H) / 2, 'go', bw) then
      for _, p in ipairs(pending) do p.choice = NewestIncluded(p) or 1 end
      S.updateAll = pending
    end
  end
end

local function StatusBadge(p)
  local st = p.lic and p.lic.status or 'none'
  -- FX Devices' JSFX: FX Devices' license
  if p.licenseOf and not HasValidKey(p) then return 'Needs FX Devices', P.ink2 end
  if st == 'free' then return 'Free', P.acc end
  if st == 'active' then return 'Owned', P.acc end
  if st == 'trial' then
    local d = DaysLeft(p.lic.expiresAt)
    return 'Trial' .. (d and (' \194\183 ' .. d .. (d == 1 and ' day' or ' days')) or ''), P.amber
  end
  if st == 'expired' then return 'Trial ended', P.red end
  if st == 'invalid' or st == 'revoked' then return 'Key not valid', P.red end
  return 'Not owned', P.ink2
end

local function VersionLine(p)
  local parts = {}
  local parent = Parent(p)
  if parent then parts[#parts + 1] = 'Installed with ' .. parent.name
  elseif not p.installed then parts[#parts + 1] = 'Not installed'
  elseif p.installed == 'installed' then parts[#parts + 1] = 'Installed \194\183 version unknown'
  elseif IsDev(p.installed) then parts[#parts + 1] = 'Installed \194\183 dev build'
  else parts[#parts + 1] = 'Installed \194\183 v' .. p.installed:gsub('^[vV]', '') end
  local latest = Latest(p)
  if latest then parts[#parts + 1] = 'Latest \194\183 v' .. latest:gsub('^[vV]', '')
  else parts[#parts + 1] = 'No release yet' end
  local upto = Owned(p) and p.lic.updatesUntil
  if upto then
    parts[#parts + 1] = (upto < os.time() * 1000 and 'Updates ended ' or 'Updates until ') .. DateText(upto)
  end
  return table.concat(parts, '     ')
end

local function VersionCombo(p, w)
  local _, label = ChosenRef(p)
  local preview = p.releases[p.choice] and (label .. (p.choice == 1 and ' (newest)' or '')) or label
  im.SetNextItemWidth(ctx, w)
  im.PushFont(ctx, F.body)
  if im.BeginCombo(ctx, '##ver' .. p.id, preview) then
    for j, rel in ipairs(p.releases) do
      local about = (rel.name or ''):gsub('^v?' .. rel.tag:gsub('%p', '%%%0') .. '%s*[-:]*%s*', '')
      if about:match('^%a*%d[%d%.]*$') then about = '' end -- just the version again
      if #about > 40 then about = about:sub(1, 38) .. '...' end
      local text = 'Version ' .. rel.tag .. (j == 1 and ' (newest)' or '') .. (about ~= '' and ('  \194\183  ' .. about) or '')
        .. (Included(rel) and '' or '  (renew to get it)')
      if im.Selectable(ctx, text .. '##' .. j, p.choice == j) then p.choice = j end
    end
    if not (p.releasesOnly and #p.releases > 0)
      and im.Selectable(ctx, 'Development version' .. (HasValidKey(p) and '' or '  (needs a key)'), p.choice > #p.releases) then
      p.choice = #p.releases + 1
    end
    im.EndCombo(ctx)
  end
  local rel = p.releases[p.choice]
  if rel and rel.notes and rel.notes ~= '' and im.IsItemHovered(ctx) then
    im.SetTooltip(ctx, rel.notes:sub(1, 600))
  end
  im.PopFont(ctx)
end

-- Files the person changed that the update changes too: keep theirs or take the new one, each or all
local function ConflictPanel(dl, p, ix, cy, iw, busy)
  local a = p.ask
  local n = #a.conflicts
  cy = cy + Banner(dl, ix, cy, iw, 'warn', ('You changed %d file%s that this update also changes. Keep your version, or use the new one '
    .. '(your changes to it are then discarded)?'):format(n, n == 1 and '' or 's')) + 10
  local kw, nw = Btn_W('Keep mine'), Btn_W('Use new')
  for i, c in ipairs(a.conflicts) do
    local bx = ix + iw - kw - 6 - nw
    if Btn('##keep' .. p.id .. i, 'Keep mine', bx, cy, c.keep and 'go' or 'ghost', kw) then c.keep = true end
    if Btn('##new' .. p.id .. i, 'Use new', bx + kw + 6, cy, c.keep and 'ghost' or 'go', nw) then c.keep = false end
    im.DrawList_PushClipRect(dl, ix, cy - 2, bx - 10, cy + BTN_H, true)
    Txt(dl, F.body, 13, ix, cy, P.ink, (c.path:match('([^/]+)$'):gsub('%.%w+$', '')))
    Mono_Caps(dl, 10, ix, cy + 17, P.ink3, c.path:match('([^/]+)/[^/]+$') or '')
    im.DrawList_PopClipRect(dl)
    cy = cy + BTN_H + 8
  end
  cy = cy + 4
  local aw, uw = Btn_W('Keep all mine'), Btn_W('Use all new')
  if Btn('##keepall' .. p.id, 'Keep all mine', ix, cy, 'ghost', aw) then for _, c in ipairs(a.conflicts) do c.keep = true end end
  if Btn('##newall' .. p.id, 'Use all new', ix + aw + 8, cy, 'ghost', uw) then for _, c in ipairs(a.conflicts) do c.keep = false end end
  local gw, cw = Btn_W('Continue'), Btn_W('Cancel')
  if Btn('##askgo' .. p.id, 'Continue', ix + iw - gw, cy, 'go', gw, busy) then
    S.job, p.ask = a.job, nil
  end
  if Btn('##askcancel' .. p.id, 'Cancel', ix + iw - gw - 8 - cw, cy, 'ghost', cw) then p.ask = nil end
  return cy + BTN_H + 12
end

-- the install button: its label and look
local function PrimaryAction(p)
  local primary, kind
  if not p.installed then primary, kind = 'Install', 'go'
  elseif UpdateAvailable(p) and p.choice == NewestIncluded(p) then primary, kind = 'Update', 'go'
  elseif IsDev(p.installed) and p.choice > #p.releases then primary, kind = 'Update', 'ghost'
  else primary, kind = 'Reinstall', 'ghost' end
  if p.installed and p.choice ~= NewestIncluded(p) and p.releases[p.choice] and p.releases[p.choice].tag ~= p.installed then
    primary, kind = 'Install this version', 'ghost'
  end
  return primary, kind
end

-- under a card's top part: install progress, the message with its folders, the keep-or-replace question
local function CardStatus(dl, p, ix, cy, iw, busy)
  local job = S.job and S.job.p == p and S.job
  if job then
    local n, total = job.n, #job.queue
    im.DrawList_AddRectFilled(dl, ix, cy, ix + iw, cy + 2, P.soft)
    im.DrawList_AddRectFilled(dl, ix, cy, ix + iw * (total > 0 and n / total or 1), cy + 2, P.acc)
    cy = cy + 10
    local item = job.queue[n + 1]
    local text = ('%d / %d  '):format(n, total) .. (item and item.path or 'finishing')
    im.DrawList_PushClipRect(dl, ix, cy - 2, ix + iw, cy + 16, true)
    Mono_Caps(dl, 10, ix, cy, P.ink2, text)
    im.DrawList_PopClipRect(dl)
    cy = cy + 22
  end
  if p.msg then
    cy = cy + Banner(dl, ix, cy, iw, p.msg.kind, p.msg.text) + 10
    -- where it went, each folder with a button that opens it
    for i, d in ipairs(p.msg.folders or {}) do
      local bw = Btn_W(REVEAL_LABEL)
      if Btn('##reveal' .. p.id .. i, REVEAL_LABEL, ix + iw - bw, cy, 'ghost', bw) then RevealFolder(d.dir) end
      Mono_Caps(dl, 10, ix, cy, P.ink3, 'Installed to  \194\183  ' .. d.label)
      -- long paths keep their end, which is the part that tells them apart
      local font, room, path = F_Mono(11), iw - bw - 16, d.dir
      if TextW(path, font) > room then
        while #path > 1 and TextW('...' .. path, font) > room do path = path:sub(2) end
        path = '...' .. path
      end
      Txt(dl, font, 11, ix, cy + 15, P.ink2, path)
      if path ~= d.dir and im.IsMouseHoveringRect(ctx, ix, cy, ix + room, cy + BTN_H) then im.SetTooltip(ctx, d.dir) end
      cy = cy + BTN_H + 6
    end
  end
  if p.ask then cy = ConflictPanel(dl, p, ix, cy, iw, busy) end
  return cy
end

local function ProductCard(p, x, y, w)
  local dl = im.GetWindowDrawList(ctx)
  if CardH[p.id] then Card_Bg(dl, x, y, w, CardH[p.id]) end
  local ix, iw = x + CARD_PX, w - CARD_PX * 2
  local cy = y + CARD_PY
  local busy = S.job ~= nil or S.busy ~= nil

  -- name and license badge
  local fa = F_Anton(26)
  Txt(dl, fa, 26, ix, cy - 2, P.ink, p.name:upper())
  local label, clr = StatusBadge(p)
  Badge(dl, ix + TextW(p.name:upper(), fa) + 14, cy + 6, label, clr)
  if p.lic and p.lic.offline then
    Mono_Caps(dl, 10, ix + TextW(p.name:upper(), fa) + 14 + Badge_W(label) + 10, cy + 11, P.ink3, 'offline')
  end

  -- buttons on the right: Buy (when not owned), then install / update / reinstall
  local bx = ix + iw
  local primary, kind = PrimaryAction(p)
  local parent = Parent(p)
  if not parent then
    local pw = Btn_W(primary)
    bx = bx - pw
    if Btn('##prim' .. p.id, primary, bx, cy, kind, pw, busy) then
      Busy('Getting the file list...', function() StartInstall(p) end)
    end
  end
  if p.free and p.pageUrl then
    local bw = Btn_W('About')
    bx = bx - 8 - bw
    if Btn('##page' .. p.id, 'About', bx, cy, 'ghost', bw) then OpenUrl(p.pageUrl) end
  elseif not p.free and (not Owned(p) or NeedsRenewal(p)) then
    -- buying again with the same email renews the updates on the same key
    local buy = Owned(p) and 'Renew' or 'Buy'
    local bw = Btn_W(buy)
    bx = bx - 8 - bw
    if Btn('##buy' .. p.id, buy, bx, cy, 'buy', bw) then OpenUrl(p.buyUrl or (SITE .. '/#pricing')) end
  end
  cy = cy + 36

  -- what it is, and the versions
  if p.description then
    for _, l in ipairs(Wrap(p.description, F.body, iw)) do Txt(dl, F.body, 13, ix, cy, P.ink2, l); cy = cy + 17 end
  end
  cy = cy + 6
  local vline = VersionLine(p)
  Mono_Caps(dl, 10, ix, cy, UpdateAvailable(p) and P.acc or P.ink3, vline)
  if UpdateAvailable(p) then
    Badge(dl, ix + Mono_Caps_W(10, vline) + 12, cy - 5, 'Update', P.acc)
  end
  cy = cy + 22

  -- installing, the message for this script, the keep-or-replace question
  cy = CardStatus(dl, p, ix, cy, iw, busy)

  -- divider, then the version picker, license link and Run
  im.DrawList_AddLine(dl, ix, cy, ix + iw, cy, P.soft, 1)
  cy = cy + 12
  if parent then
    Txt(dl, F.body, 13, ix, cy, P.ink2, 'Comes with ' .. parent.name .. ': updating ' .. parent.name .. ' updates ' .. p.name .. ' too.')
    cy = cy + 21
    CardH[p.id] = cy + CARD_PY - 4 - y
    im.SetCursorScreenPos(ctx, x, y + CardH[p.id])
    im.Dummy(ctx, w, 0)
    return CardH[p.id]
  end
  Mono_Caps(dl, 10, ix, cy + 9, P.ink3, 'Version')
  local rx = ix + iw
  if p.installed and p.mainScript then
    local rw = Btn_W('Run')
    rx = rx - rw
    if Btn('##run' .. p.id, 'Run', rx, cy, 'ghost', rw, busy) then RunScript(p) end
    rx = rx - 8
  end
  -- without a license, signing in is the next step: a full button, filled (free products have none)
  if not p.free then
    local licensed = HasValidKey(p)
    local keyLabel = p.showKey and 'Hide license' or (licensed and 'License' or 'Sign in / free trial')
    local kw = Btn_W(keyLabel)
    rx = rx - kw
    if Btn('##keylink' .. p.id, keyLabel, rx, cy, (licensed or p.showKey) and 'ghost' or 'go', kw) then
      p.showKey = not p.showKey
      p.msg = nil
    end
  end
  im.SetCursorScreenPos(ctx, ix + 70, cy)
  if busy then im.BeginDisabled(ctx) end
  VersionCombo(p, math.max(120, math.min(260, rx - 16 - (ix + 70))))
  if busy then im.EndDisabled(ctx) end
  cy = cy + BTN_H + 4

  -- sign-in: the license or free trial comes from the person's account on the site
  if not p.free and (p.showKey or p.link) then
    cy = cy + 10
    local k = p.link
    local function Lines(text, c)
      for _, l in ipairs(Wrap(text, F.body, iw)) do Txt(dl, F.body, 13, ix, cy, c or P.ink2, l); cy = cy + 17 end
    end
    if k and k.phase ~= 'starting' then
      if k.phase == 'nolicense' then
        Lines('Signed in as ' .. tostring(k.email) .. ', which has no ' .. p.name .. ' license yet. Start the free trial on that page, or buy a license; this updates by itself.')
      elseif k.phase == 'limit' then
        Lines(tostring(k.email) .. '\'s license is already on 3 computers. Remove one on your account page and this computer is added by itself.', P.amber)
      else
        Lines('Finish signing in in your browser. Your code:')
        cy = cy + 4
        Txt(dl, F_Mono(13, true), 20, ix, cy, P.ink, tostring(k.userCode))
        cy = cy + 30
      end
      cy = cy + 6
      local ow, cw = Btn_W('Open page again'), Btn_W('Cancel')
      if Btn('##open' .. p.id, 'Open page again', ix, cy, 'ghost', ow) then OpenUrl(k.url) end
      if Btn('##cancel' .. p.id, 'Cancel', ix + ow + 8, cy, 'ghost', cw) then StopLink(p) end
      cy = cy + BTN_H + 4
    elseif k then
      Spinner(dl, ix, cy, 'Opening the sign-in page...')
      cy = cy + 24
    elseif HasValidKey(p) then
      Lines((p.lic.status == 'trial' and 'Free trial' or 'License') .. ((S.email or '') ~= '' and (' for ' .. S.email) or '') .. ', saved for ' .. p.name .. ' on this computer.')
      cy = cy + 6
      local bw = Btn_W('Use another account')
      if Btn('##relink' .. p.id, 'Use another account', ix, cy, 'ghost', bw, busy) then StartLink(p) end
      cy = cy + BTN_H + 4
    else
      Lines('Sign in with the account you bought ' .. p.name .. ' with. No license yet? The same page starts your free 30-day trial. This also activates this computer for ' .. p.name .. ' (3 computers per license).')
      cy = cy + 6
      local bw = Btn_W('Sign in with browser')
      if Btn('##link' .. p.id, 'Sign in with browser', ix, cy, 'go', bw, busy) then StartLink(p) end
      cy = cy + BTN_H + 4
    end
  end

  CardH[p.id] = cy + CARD_PY - 4 - y
  im.SetCursorScreenPos(ctx, x, y + CardH[p.id])
  im.Dummy(ctx, w, 0)
  return CardH[p.id]
end

-- a JSFX's GUI preview as an image, nil until it's downloaded (or when it can't be read)
local function PreviewImage(p)
  if p.previewImg == nil and p.previewFile and Exists(p.previewFile) then
    local ok, img = pcall(im.CreateImage, p.previewFile)
    p.previewImg = ok and img or false
    if p.previewImg then im.Attach(ctx, p.previewImg) end
  end
  return p.previewImg or nil
end

-- A JSFX: a card in a two-column grid, its GUI in miniature across the top; installs the newest
-- release. rowH is the tallest card of its row (last frame), so the buttons line up along the row.
local PREVIEW_RATIO = 0.3
local function JsfxCard(p, x, y, w, rowH)
  local dl = im.GetWindowDrawList(ctx)
  local h = math.max(CardH[p.id] or 0, rowH or 0)
  if h > 0 then Card_Bg(dl, x, y, w, h) end
  local pad = 14
  local ix, iw = x + pad, w - pad * 2
  local busy = S.job ~= nil or S.busy ~= nil

  -- the GUI preview, edge to edge (an empty frame until the picture is there): a taller picture
  -- shows its middle, a wider one sits centered on black
  local px, py, pw = x + 1, y + 1, w - 2
  local ph = math.floor(pw * PREVIEW_RATIO)
  im.DrawList_AddRectFilled(dl, px, py, px + pw, py + ph, 0x050505FF)
  local img = PreviewImage(p)
  if img then
    local iw0, ih0 = im.Image_GetSize(img)
    if iw0 and iw0 > 0 and ih0 > 0 then
      local fit = pw * ih0 / iw0
      if fit >= ph then
        local v = ph / fit
        im.DrawList_AddImage(dl, img, px, py, px + pw, py + ph, 0, (1 - v) / 2, 1, (1 + v) / 2)
      else
        local oy = math.floor((ph - fit) / 2)
        im.DrawList_AddImage(dl, img, px, py + oy, px + pw, py + oy + fit)
      end
    end
  end
  if p.pageUrl then
    local clicked, hov = Hit('##prev' .. p.id, px, py, pw, ph)
    if hov then im.SetTooltip(ctx, 'See ' .. p.name .. ' in action') end
    if clicked then OpenUrl(p.pageUrl) end
    if hov then im.DrawList_AddRect(dl, px, py, px + pw, py + ph, 0xFFFFFF80) end
  end
  im.DrawList_AddLine(dl, px, py + ph, px + pw, py + ph, P.line, 1)

  -- name and badge, what it is, whether it's installed
  local cy = py + ph + 12
  local fa = F_Anton(18)
  local label, clr = StatusBadge(p)
  local bw = Badge_W(label)
  im.DrawList_PushClipRect(dl, ix, cy - 6, ix + iw - bw - 8, cy + 28, true)
  Txt(dl, fa, 18, ix, cy, P.ink, p.name:upper())
  im.DrawList_PopClipRect(dl)
  Badge(dl, ix + iw - bw, cy + 1, label, clr)
  cy = cy + 30
  if p.description then
    for _, l in ipairs(Wrap(p.description, F.body, iw)) do Txt(dl, F.body, 13, ix, cy, P.ink2, l); cy = cy + 17 end
  end
  cy = cy + 6
  -- its releases are FX Devices' (it ships there), so no version numbers here
  local parent = Parent(p)
  local vline = parent and ('Installed with ' .. parent.name) or not p.installed and 'Not installed'
    or UpdateAvailable(p) and 'Installed \194\183 update available' or 'Installed'
  im.DrawList_PushClipRect(dl, ix, cy - 2, ix + iw, cy + 14, true)
  Mono_Caps(dl, 10, ix, cy, UpdateAvailable(p) and P.acc or P.ink3, vline)
  im.DrawList_PopClipRect(dl)
  cy = cy + 18
  if parent then
    for _, l in ipairs(Wrap('Updating ' .. parent.name .. ' updates it too.', F.body, iw)) do
      Txt(dl, F.body, 13, ix, cy, P.ink3, l); cy = cy + 17
    end
  end

  -- progress, message, questions
  cy = CardStatus(dl, p, ix, cy + 6, iw, busy)

  -- the buttons, along the bottom of the row
  local hasBtn = not parent or p.pageUrl
  if hasBtn then
    local natural = cy + 6
    local by = math.max(natural, y + h - pad - BTN_H)
    local bx = ix + iw
    if not parent then
      local primary, kind = PrimaryAction(p)
      local w1 = Btn_W(primary)
      bx = bx - w1
      if Btn('##prim' .. p.id, primary, bx, by, kind, w1, busy) then
        Busy('Getting the file list...', function() StartInstall(p) end)
      end
      bx = bx - 8
    end
    if p.pageUrl then
      local w2 = Btn_W('About')
      if Btn('##page' .. p.id, 'About', bx - w2, by, 'ghost', w2) then OpenUrl(p.pageUrl) end
    end
    cy = natural + BTN_H
  end

  CardH[p.id] = cy + pad - y
  return CardH[p.id]
end

local function ExtensionsCard(x, y, w)
  local dl = im.GetWindowDrawList(ctx)
  if CardH.ext then Card_Bg(dl, x, y, w, CardH.ext) end
  local ix, iw = x + CARD_PX, w - CARD_PX * 2
  local cy = y + CARD_PY - 4
  local toInstall = {}
  for i, e in ipairs(EXTENSIONS) do
    if i > 1 then im.DrawList_AddLine(dl, ix, cy, ix + iw, cy, P.soft, 1) end
    local st = ExtStatus(e)
    local ry = cy + 10
    Txt(dl, F.bodyB, 13, ix, ry + 3, P.ink, e.name)
    Txt(dl, F.body, 13, ix + 130, ry + 3, P.ink2, st == 'restart' and 'Restart REAPER to load it'
      or st == 'outdated' and 'Too old for Vertical FX List: update to the current version' or e.why)
    local label, clr = 'OK', P.acc
    if st == 'restart' then label, clr = 'Restart', P.blue
    elseif st == 'outdated' then label, clr = 'Update', P.amber
    elseif st == 'missing' then label, clr = 'Missing', P.amber end
    Badge(dl, ix + iw - Badge_W(label), ry, label, clr)
    if st == 'missing' or st == 'outdated' then toInstall[#toInstall + 1] = e end
    cy = ry + BADGE_H + 10
  end
  local job = S.extJob
  if job then
    -- downloading: what, and how far
    cy = cy + 4
    Mono_Caps(dl, 10, ix, cy, P.ink2, job.label .. (job.bytes and job.bytes > 0 and ('   ' .. MB(job.bytes)) or ''))
    cy = cy + 18
    im.DrawList_AddRectFilled(dl, ix, cy, ix + iw, cy + 2, P.soft)
    im.DrawList_AddRectFilled(dl, ix, cy, ix + iw * (job.frac or 0), cy + 2, P.acc)
    cy = cy + 12
  elseif #toInstall > 0 then
    cy = cy + 4
    local one = toInstall[1]
    local label = #toInstall > 1 and ('Install the ' .. #toInstall .. ' missing extensions')
      or ((ExtStatus(one) == 'outdated' and 'Update ' or 'Install ') .. one.name)
    if Btn('##extinst', label, ix, cy, 'go', nil, S.busy ~= nil) then
      S.extJob, S.extFrames = InstallJob(toInstall), 0
    end
    cy = cy + BTN_H + 6
  end
  CardH.ext = cy + CARD_PY - 6 - y
  im.SetCursorScreenPos(ctx, x, y + CardH.ext)
  im.Dummy(ctx, w, 0)
  return CardH.ext
end

local function Content(cx, cy, avail)
  local dl = im.GetWindowDrawList(ctx)
  local w = math.min(avail - PAD * 2, 640)
  local px = cx + PAD
  Ring(dl, px + w - 40, cy + 62, 34)
  Mono_Caps(dl, 10, px, cy + 26, P.ink3, 'Script Manager  /  v' .. VERSION)
  Chrome_Text(dl, F_Anton(36), 36, px, cy + 42, 'YOUR SCRIPTS')
  Txt(dl, F.body, 13, px, cy + 92, P.ink2, 'Install, update and license Cool Reaper Scripts.')
  local y = cy + 124

  if S.busy then
    Spinner(dl, px, y, S.busy.label)
  end
  y = y + 22
  if S.msg then y = y + Banner(dl, px, y, w, S.msg.kind, S.msg.text) + 14 end
  -- a newer Script Manager on the site
  if S.selfUpdate then
    local u = S.selfUpdate
    y = y + Banner(dl, px, y, w, 'info', 'Script Manager ' .. u.version .. ' is out (you have ' .. VERSION .. ').'
      .. (u.notes and ('\n' .. u.notes) or '')) + 8
    local label = 'Update the Script Manager'
    if Btn('##selfupd', label, px, y, 'go', Btn_W(label), S.busy ~= nil or S.job ~= nil or S.updateAll ~= nil) then UpdateManager() end
    y = y + BTN_H + 14
  end
  -- a second copy of Prism EQ: offer to delete it (checked again after each install)
  if S.loaded and not S.job then S.loose = S.loose or LooseCopies() end
  for i, c in ipairs(S.loose or {}) do
    y = y + Banner(dl, px, y, w, 'warn', 'You have ' .. c.product .. ' twice: "' .. c.name .. '" is also straight in your Effects folder '
      .. '(the website download), so REAPER\'s FX browser lists it twice. Delete that extra copy? The one the Script Manager keeps up to date stays; '
      .. 'projects that used the extra copy need ' .. c.product .. ' added again.') + 8
    local bw = Btn_W('Delete extra copy')
    if Btn('##loose' .. i, 'Delete extra copy', px, y, 'go', bw, S.busy ~= nil) then
      local ok = os.remove(c.path)
      S.loose = nil
      S.msg = ok and { kind = 'ok', text = 'Deleted the extra ' .. c.name .. '. Projects that used that copy need ' .. c.product .. ' added again from the FX browser.' }
        or { kind = 'err', text = 'Couldn\'t delete ' .. c.path .. '. Delete it yourself and reopen the FX browser.' }
    end
    y = y + BTN_H + 14
  end

  -- scripts first, then plugins and JSFX (smaller cards with a GUI preview), then the extensions
  local n = 0
  for _, p in ipairs(S.products) do ShareLicense(p) end
  for _, sec in ipairs({ { title = 'Scripts' }, { title = 'Plugins', kind = 'clap', grid = true }, { title = 'JSFX', kind = 'jsfx', grid = true } }) do
    local list, missing = {}, {}
    for _, p in ipairs(S.products) do
      if p.kind == sec.kind then
        list[#list + 1] = p
        if not p.installed and not Parent(p) then missing[#missing + 1] = p end
      end
    end
    if #list > 0 or not sec.grid then
      n = n + 1
      Kicker(dl, px, y, n, sec.title)
      -- every one of this section that isn't installed yet, one after another
      if #missing > 0 and not S.job and not S.busy and not S.updateAll then
        local label = 'Install all (' .. #missing .. ')'
        local bw = Btn_W(label)
        if Btn('##install' .. n, label, px + w - bw, y - 6, 'ghost', bw) then
          for _, p in ipairs(missing) do p.choice = NewestIncluded(p) or 1 end
          S.updateAll = missing
        end
      end
      y = y + 32
      if not S.loaded and #S.products == 0 then y = y + 10 end
      if sec.grid then
        -- two to a row, each row as tall as its tallest card
        local gap = 10
        local cw = math.floor((w - gap) / 2)
        for i = 1, #list, 2 do
          local a, b = list[i], list[i + 1]
          local rowH = math.max(CardH[a.id] or 0, b and CardH[b.id] or 0)
          im.PushID(ctx, a.id)
          local ha = JsfxCard(a, px, y, cw, rowH)
          im.PopID(ctx)
          local hb = 0
          if b then
            im.PushID(ctx, b.id)
            hb = JsfxCard(b, px + w - cw, y, cw, rowH)
            im.PopID(ctx)
          end
          y = y + math.max(ha, hb, rowH) + gap
        end
        im.SetCursorScreenPos(ctx, px, y)
        im.Dummy(ctx, w, 0)
      else
        for _, p in ipairs(list) do
          im.PushID(ctx, p.id)
          y = y + ProductCard(p, px, y, w) + 14
          im.PopID(ctx)
        end
      end
      y = y + 12
    end
  end
  Kicker(dl, px, y, n + 1, 'Free extensions the scripts need')
  y = y + 32
  y = y + ExtensionsCard(px, y, w) + 20

  -- footer
  local c1, w1 = Link('##site', dl, px, y, 'coolreaperscripts.com', P.ink2)
  if c1 then OpenUrl(SITE) end
  if not S.busy and not S.job then
    local c2 = Link('##refresh', dl, px + w1 + 24, y, 'Check for updates', P.ink2)
    if c2 then
      S.msg = nil
      for _, p in ipairs(S.products) do p.msg = nil end
      Busy('Checking for updates...', LoadProducts)
    end
  end
  local by = 'by Bryan Chi'
  Mono_Caps(dl, 10, px + w - Mono_Caps_W(10, by), y, P.ink3, by)
  -- the connection reports: what they are, their off switch, Copy diagnostics
  y = y + 30
  local on = BG.ReportsOn()
  for _, l in ipairs(Wrap(on and 'Failed connections to coolreaperscripts.com are reported once a day so they can be fixed: what failed, the error, your system and versions. Never your keys, email or files.'
    or 'Connection reports are off.', F.body, w)) do
    Txt(dl, F.body, 12, px, y, P.ink3, l)
    y = y + 16
  end
  y = y + 6
  local c3, w3 = Link('##netrep', dl, px, y, on and 'Turn off reports' or 'Turn on reports', P.ink3)
  if c3 then BG.SetReports(not on) end
  local copied = S.copiedAt and r.time_precise() - S.copiedAt < 1.5
  if Link('##diag', dl, px + w3 + 24, y, copied and 'Copied' or 'Copy diagnostics', P.ink3) then
    im.SetClipboardText(ctx, BG.Diagnostics())
    S.copiedAt = r.time_precise()
  end
  im.SetCursorScreenPos(ctx, px, y + 40)
  im.Dummy(ctx, w, 0)
end

---------------------------------------------------------------------------------------------------
-- Frame
---------------------------------------------------------------------------------------------------

local function Frame()
  BG.FontsTick()
  BG.UploadTick()
  -- one step at a time, after its label has drawn; it runs as a coroutine, so while it waits on
  -- the site the window keeps drawing (S.busy stays until it's done)
  if S.busy then
    local b = S.busy
    b.frames = b.frames + 1
    if b.frames >= 3 then
      b.co = b.co or coroutine.create(b.fn)
      local ok, err = coroutine.resume(b.co)
      if not ok then S.busy = nil error(debug.traceback(b.co, err), 0) end
      if coroutine.status(b.co) == 'dead' and S.busy == b then S.busy = nil end
    end
  elseif S.job then
    BG.InstallStep(S.job)
  else
    QueueTick()
  end
  for _, p in ipairs(S.products) do LinkTick(p) end
  -- extension downloads: one file per frame, after the progress line has drawn once
  if S.extJob and not S.busy then
    S.extFrames = S.extFrames + 1
    if S.extFrames > 2 and InstallTick(S.extJob) then
      local job = S.extJob
      S.extJob = nil
      S.msg = { kind = #job.failed > 0 and 'warn' or 'ok', text = ExtensionReport(job.done, job.failed, job.restart) }
    end
  end

  im.PushStyleVar(ctx, im.StyleVar_WindowPadding, 0, 0)
  im.PushStyleVar(ctx, im.StyleVar_WindowRounding, 0)
  im.PushStyleVar(ctx, im.StyleVar_WindowBorderSize, 1)
  im.PushStyleVar(ctx, im.StyleVar_ItemSpacing, 0, 0)
  im.PushStyleVar(ctx, im.StyleVar_ScrollbarSize, 8)
  im.PushStyleVar(ctx, im.StyleVar_ScrollbarRounding, 0)
  im.PushStyleColor(ctx, im.Col_WindowBg, P.page)
  im.PushStyleColor(ctx, im.Col_ChildBg, 0x00000000)
  im.PushStyleColor(ctx, im.Col_Border, P.line2)
  im.PushStyleColor(ctx, im.Col_ScrollbarBg, 0x00000000)
  im.PushStyleColor(ctx, im.Col_ScrollbarGrab, 0xFFFFFF1F)
  im.PushStyleColor(ctx, im.Col_ScrollbarGrabHovered, 0xFFFFFF38)
  im.PushStyleColor(ctx, im.Col_ScrollbarGrabActive, P.acc)
  Widgets_Push()
  im.PushFont(ctx, F.body)
  im.SetNextWindowSize(ctx, 700, 760, im.Cond_FirstUseEver)
  im.SetNextWindowSizeConstraints(ctx, 600, 420, 700, 1600)
  local visible, open = im.Begin(ctx, TITLE, true,
    im.WindowFlags_NoCollapse | im.WindowFlags_NoTitleBar | im.WindowFlags_NoScrollbar | im.WindowFlags_NoScrollWithMouse)
  if visible then
    local x, y = im.GetWindowPos(ctx)
    local w, h = im.GetWindowSize(ctx)
    local dl = im.GetWindowDrawList(ctx)
    -- the site's column guides
    for k = 1, 5 do
      local gx = math.floor(x + w * k / 6) + 0.5
      im.DrawList_AddLine(dl, gx, y + HEADER_H, gx, y + h, P.guide, 1)
    end
    Header(dl, x, y, w)
    im.SetCursorScreenPos(ctx, x + 1, y + HEADER_H + 1)
    if im.BeginChild(ctx, '##content', w - 2, h - HEADER_H - 2) then
      local cx, cy = im.GetCursorScreenPos(ctx)
      Content(cx, cy, im.GetContentRegionAvail(ctx))
      im.EndChild(ctx)
    end
    if im.IsWindowFocused(ctx, im.FocusedFlags_RootAndChildWindows) and im.IsKeyPressed(ctx, im.Key_Escape)
      and not im.IsAnyItemActive(ctx) then
      S.close = true
    end
    im.End(ctx)
  end
  im.PopFont(ctx)
  Widgets_Pop()
  im.PopStyleColor(ctx, 7)
  im.PopStyleVar(ctx, 6)
  if open and not S.close then r.defer(Frame)
  elseif S.restart then
    -- the updated Script Manager, in a fresh window
    local path = S.restart
    r.defer(function() dofile(path) end)
  end
end

S.msg = SETTLE_NOTE
if not S.msg and #MissingExtensions() > 0 then
  S.msg = { kind = 'warn', text = 'Some free extensions the scripts need are missing or too old. Install them at the bottom of this window.' }
end
Busy('Checking your scripts...', LoadProducts)
r.defer(Frame)
