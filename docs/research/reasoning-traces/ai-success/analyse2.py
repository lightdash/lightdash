import os, pandas as pd, numpy as np, warnings; warnings.filterwarnings('ignore')
import statsmodels.api as sm
SP=os.environ.get('AI_SPIKE_DIR', '.')
p=pd.read_pickle(SP+'/p.pkl')
internal={'d413dcea-4c8f-46b6-baa5-23885490e08b','d29b97cd-0b45-4aa0-89f8-27ddc6d3d1a2','6bf815d9-d122-4f09-a849-9944bfa3478e','7d11ad55-e48d-41bc-97a0-ef3bf70e3a18'}
p['internal']=p.organization_id.isin(internal)
print('internal share of prompts',round(p.internal.mean()*100,1),'%')
p['model_family']=p.model.fillna('unknown').str.replace(r'-\d{4}-\d{2}-\d{2}.*$','',regex=True).str.replace(r'-\d{8}$','',regex=True)
p['pinned']=p.has_pinned_context.fillna(False).astype(int); p['anthropic']=(p.provider=='anthropic').astype(int); p['first']=(p.prompt_index==1).astype(int); p['log_tools']=np.log1p(p.n_tools); p['retry']=(p.viz_n>=2).astype(int)
ext=p[~p.internal]; web=ext[ext.prompt_context=='web_app']; viz=web[web.viz==1]
print('external: prompts',len(ext),'orgs',ext.organization_id.nunique(),'viz prompts',len(viz),'chart-action rate',round(viz.chart_action.mean()*100,2))
def logit(d,cols,y,label):
    d=d.dropna(subset=cols); X=sm.add_constant(d[cols].astype(float)); m=sm.GLM(d[y],X,family=sm.families.Binomial()).fit(cov_type='cluster',cov_kwds={'groups':d.organization_id.astype('category').cat.codes})
    r=pd.DataFrame({'OR':np.exp(m.params),'lo':np.exp(m.conf_int()[0]),'hi':np.exp(m.conf_int()[1]),'p':m.pvalues}).round(3); print(f'\n## {label} n={len(d)} orgs={d.organization_id.nunique()}'); print(r.to_string())
cols=['search','metadata','values','sql','content','knowledge','retry','log_tools','pinned','anthropic','reasoning','scoped','memory','first']
logit(viz,cols,'chart_action','logit chart_action, external orgs only')
# org-balanced: cap each org at 300 viz prompts
cap=viz.sample(frac=1,random_state=1).groupby('organization_id').head(300)
logit(cap,cols,'chart_action','logit chart_action, external, capped 300/org')
th=p[(p.thumb_up==1)|(p.thumb_down==1)]
logit(th,['sql','content','log_tools','pinned','anthropic','first','viz'],'thumb_up','logit thumb_up (all thumbed prompts)')
# key rates external
for f in ['pinned','sql','content','first']:
    g=viz.groupby(f).chart_action.agg(['size','mean']); print(f'external {f}:', {k:(int(v['size']),round(v['mean']*100,2)) for k,v in g.iterrows()})
# trajectory length curve
c=viz.groupby(viz.n_tools.clip(upper=15)).chart_action.agg(['size','mean']); print('\n## chart-action by n_tools (external viz)'); print((c.assign(mean=(c['mean']*100).round(2))).T.to_string())
c2=th.groupby(th.n_tools.clip(upper=15)).thumb_up.agg(['size','mean']); print('## thumb-up by n_tools'); print((c2.assign(mean=(c2['mean']*100).round(1))).T.to_string())
# sequence patterns: collapse consecutive duplicates, keep first 4 tools
def pat(s):
    t=[x for x in s.split('>') if x]; out=[]
    for x in t:
        if not out or out[-1]!=x: out.append(x)
    return '>'.join(out[:4]) if out else 'none'
viz['pat']=viz.tool_seq.map(pat)
g=viz.groupby('pat').chart_action.agg(['size','mean']).query('size>=300').sort_values('mean',ascending=False); print('\n## top tool patterns (external viz, n>=300)'); print((g.assign(mean=(g['mean']*100).round(2))).head(20).to_string())
# monthly trend
ext['month']=ext.ts.dt.to_period('M'); m=ext.groupby('month').agg(prompts=('pos','size'),orgs=('organization_id','nunique'),users=('user_id','nunique'),chart_action_rate=('chart_action','mean'),thumbs=('labelled','sum'))
vm=viz.assign(month=viz.ts.dt.to_period('M')).groupby('month').chart_action.mean(); tm=th.assign(month=th.ts.dt.to_period('M')).groupby('month').thumb_up.agg(['size','mean'])
print('\n## monthly (external)'); print(m.join(vm.rename('viz_chart_action')).join(tm.rename(columns={'size':'thumbed','mean':'thumb_up_share'})).round(3).to_string())
# weekly active orgs
ext['week']=ext.ts.dt.to_period('W'); w=ext.groupby('week').agg(orgs=('organization_id','nunique'),users=('user_id','nunique'),prompts=('pos','size')); print('\n## weekly active (external)'); print(w.to_string())
# tier x pinned (is pinned the enterprise effect?)
print('\n## pinned by tier (external viz)'); print(viz.groupby(['tier','pinned']).chart_action.agg(['size','mean']).query('size>=200').assign(mean=lambda d:(d['mean']*100).round(2)).to_string())
# per-org SQL share vs metrics count (project quality)
o=ext.groupby('organization_id').agg(n=('sql','size'),sql=('sql','mean'),metrics=('metrics_count','first'),weeks=('week','nunique'),ca=('chart_action','mean')).query('n>=30')
print('\n## org-level (n>=30, external):',len(o),'corr(sql share, log metrics)',round(np.corrcoef(o.sql,np.log1p(o.metrics.fillna(0)))[0,1],3),'corr(sql share, weeks)',round(np.corrcoef(o.sql,o.weeks)[0,1],3),'corr(chart-action, weeks)',round(np.corrcoef(o.ca,o.weeks)[0,1],3))
print('orgs with sql share > 25%:',(o.sql>0.25).sum(),'their median active weeks',o[o.sql>0.25].weeks.median(),'vs others',o[o.sql<=0.25].weeks.median())
