# Keeps the PC awake on AC power so the runner stays reachable. The monitor
# may still turn off. Run once; no administrator rights are needed for these.
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change disk-timeout-ac 0
powercfg /change monitor-timeout-ac 10
git config --global core.longpaths true
Write-Output 'power settings applied:'
powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE | Select-String 'AC'
powercfg /query SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE | Select-String 'AC'
