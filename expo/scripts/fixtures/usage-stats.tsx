// Synthetic data only. Renders the production Expo stats components.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {View} from 'react-native';
import {ThemeProvider,SettingsSurface,Label,Button} from '../../src/ui';
import {UsageOverview,UsageBreakdown,UsageTabs} from '../../src/settings/UsageStats';
import {usagePeriods,usageGroupings,usageRange} from '../../src/core/usage';
const rows=[{key:'bot:scout',label:'Research & strategy',turns:42,input:820000,output:130000,cachedInput:640000,cacheReportedInput:800000,cacheReportedTurns:40,costUsd:3.84,unpriced:2},
{key:'bot:writer',label:'Writer',turns:28,input:380000,output:110000,cachedInput:320000,cacheReportedInput:380000,cacheReportedTurns:28,costUsd:1.72,unpriced:0}];
function App(){const [period,setPeriod]=useState('month'),[group,setGroup]=useState('bot');
 const mode=new URLSearchParams(location.search).get('mode');
 const total={key:'total',label:'Total',turns:70,input:1200000,output:240000,cachedInput:960000,cacheReportedInput:1180000,cacheReportedTurns:68,costUsd:5.56,unpriced:2};
 if(mode==='unknown') Object.assign(total,{cachedInput:0,cacheReportedInput:0,cacheReportedTurns:0});
 if(mode==='empty') Object.assign(total,{turns:0,input:0,output:0,cachedInput:0,cacheReportedInput:0,cacheReportedTurns:0,costUsd:null,unpriced:0});
 const data={total,groups:mode==='empty'?[]:rows.map((row,i)=>({...row,label:group==='model'?['claude-sonnet-5','gpt-6-astra'][i]:row.label,...(mode==='unknown'?{cachedInput:0,cacheReportedInput:0,cacheReportedTurns:0}:{})}))};
 const range=usageRange(period,new Date('2026-09-23T12:00:00Z'));
 return <ThemeProvider skin="system"><SettingsSurface><View style={{maxWidth:640,width:'100%',alignSelf:'center',padding:16,gap:16}}>
 <Label bold size={20} style={{textAlign:'center',paddingVertical:12}}>Usage</Label>
 <UsageTabs label="Period" value={period} options={usagePeriods} onChange={setPeriod}/>
 <Label muted size={12}>{range.from} – {range.to} · UTC</Label>
 <UsageOverview data={data}/>
 <UsageTabs label="Breakdown by" value={group} options={usageGroupings} onChange={setGroup}/>
 <UsageBreakdown data={data} group={group}/>
 <View style={{flexDirection:'row',gap:8}}><Button title="Refresh usage" onPress={()=>{}}/><Button title="Export CSV" disabled={!data.groups.length} onPress={()=>{}}/></View>
 </View></SettingsSurface></ThemeProvider>}
createRoot(document.getElementById('root')!).render(<App/>);
