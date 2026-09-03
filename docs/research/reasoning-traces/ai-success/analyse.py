import os, pandas as pd, numpy as np, json, warnings; warnings.filterwarnings('ignore')
import statsmodels.api as sm
SP=os.environ.get('AI_SPIKE_DIR', '.')
p=pd.read_pickle(SP+'/p.pkl')
out={}
def rate(df,col,by,minn=200):
    g=df.groupby(by).agg(n=(col,'size'),rate=(col,'mean')).query('n>=@minn').sort_values('rate',ascending=False)
    return g
def show(title,df,col,by,minn=200):
    g=rate(df,col,by,minn); print(f'\n## {title}  [{col} by {by}]'); print((g.assign(rate=(g.rate*100).round(2))).to_string())
    out[f'{title}|{col}|{by}']=g.reset_index().to_dict('records')
# buckets
p['n_tools_b']=pd.cut(p.n_tools,[-1,0,2,5,10,1000],labels=['0','1-2','3-5','6-10','11+'])
for d in (p,):
    d['viz_n_b']=pd.cut(d.viz_n,[-1,0,1,2,100],labels=['0','1','2','3+'])
    d['metrics_b']=pd.cut(d.metrics_count,[-1,0,20,50,100,250,100000],labels=['0','1-20','21-50','51-100','101-250','250+'])
    d['models_b']=pd.cut(d.models_count,[-1,5,15,40,100,100000],labels=['0-5','6-15','16-40','41-100','100+'])
    d['mpm_b']=pd.cut(d.metrics_per_model,[-1,0.5,1,2,4,1000],labels=['<0.5','0.5-1','1-2','2-4','4+'])
    d['fmt_b']=pd.cut(d.fmt_ratio.fillna(0),[-0.01,0,0.25,0.6,100],labels=['0','<25%','25-60%','60%+'])
    d['users_b']=pd.cut(d.users_num.fillna(0),[-1,5,20,50,200,100000],labels=['<=5','6-20','21-50','51-200','200+'])
    d['idx_b']=pd.cut(d.prompt_index,[0,1,2,4,1000],labels=['1st','2nd','3-4','5+'])
    d['urls']=(d.urls_count.fillna(0)>0).astype(int); d['grouplabels']=(d.models_with_group_label_count.fillna(0)>0).astype(int); d['errors']=(d.models_with_errors_count.fillna(0)>0).astype(int)
    d['model_family']=d.model.fillna('unknown').str.replace(r'-\d{4}-\d{2}-\d{2}.*$','',regex=True).str.replace(r'-\d{8}$','',regex=True)
web=p[p.prompt_context=='web_app']; viz=web[web.viz==1]; th=p[(p.thumb_up==1)|(p.thumb_down==1)]
print('BASE web prompts',len(web),'viz prompts',len(viz),'thumbed',len(th), 'pos rate web',round(web.pos.mean()*100,2),'chart-action rate among viz',round(viz.chart_action.mean()*100,2),'thumb-up share among thumbed',round(th.thumb_up.mean()*100,1))
# A. tool patterns (viz subset: chart action) and thumbs
for f in ['search','metadata','values','sql','content','knowledge','skill','projctx','repo','dash']:
    show(f'tool {f}',viz,'chart_action',f,300)
show('viz regenerations',viz,'chart_action','viz_n_b',300)
show('n tools',viz,'chart_action','n_tools_b',300)
show('first tool',viz,'chart_action','first_tool',500)
show('thumbs: sql',th,'thumb_up','sql',30); show('thumbs: no_tools',th,'thumb_up','no_tools',30); show('thumbs: n tools',th,'thumb_up','n_tools_b',30); show('thumbs: context',th,'thumb_up','prompt_context',30); show('thumbs: viz',th,'thumb_up','viz',30)
show('thumbs: model family',th,'thumb_up','model_family',30)
# B. context / model / project / agent / org
show('pinned context',viz,'chart_action','has_pinned_context',300)
show('model family',viz,'chart_action','model_family',500); show('provider',viz,'chart_action','provider',500); show('reasoning tokens',viz,'chart_action','reasoning',500); show('key mgmt',viz,'chart_action','key_management',300)
show('metrics count',viz,'chart_action','metrics_b',300); show('models count',viz,'chart_action','models_b',300); show('metrics per model',viz,'chart_action','mpm_b',300); show('formatted share',viz,'chart_action','fmt_b',300)
show('urls',viz,'chart_action','urls',300); show('group labels',viz,'chart_action','grouplabels',300); show('compile errors',viz,'chart_action','errors',300); show('warehouse',viz,'chart_action','warehouse_type',300)
show('agent scoped (tags)',viz,'chart_action','scoped',300); show('agent memory',viz,'chart_action','memory',300); show('integrations',viz,'chart_action','integrations_count',300)
show('org paying',viz,'chart_action','is_paying',300); show('org type',viz,'chart_action','organization_type',300); show('org size',viz,'chart_action','users_b',300); show('tier',viz,'chart_action','tier',300)
show('prompt index in thread',viz,'chart_action','idx_b',300)
show('reask<2m by sql',web,'reask_2m','sql',300); show('reask<2m by viz_n',web,'reask_2m','viz_n_b',300); show('reask by metrics',web,'reask_2m','metrics_b',300)
# sql fallback share by project metrics
print('\n## share of prompts using SQL tools by metrics bucket'); print((p.groupby('metrics_b').agg(n=('sql','size'),sql_share=('sql','mean'),search_share=('search','mean'),viz_share=('viz','mean'))*[1,100,100,100]).round(1).to_string())
# C. logistic regression on viz subset, cluster by org
d=viz.dropna(subset=['metrics_count','tags_count']).copy()
d['log_metrics']=np.log1p(d.metrics_count); d['log_models']=np.log1p(d.models_count); d['log_tools']=np.log1p(d.n_tools); d['log_users']=np.log1p(d.users_num.fillna(0))
d['anthropic']=(d.provider=='anthropic').astype(int); d['paying']=d.is_paying.fillna(False).astype(int); d['pinned']=d.has_pinned_context.fillna(False).astype(int)
d['retry']=(d.viz_n>=2).astype(int); d['first']=(d.prompt_index==1).astype(int); d['fmt']=d.fmt_ratio.fillna(0).clip(0,1)
X=d[['search','metadata','values','sql','content','knowledge','retry','log_tools','pinned','anthropic','reasoning','log_metrics','log_models','fmt','urls','grouplabels','scoped','memory','paying','log_users','first']]
X=sm.add_constant(X.astype(float)); y=d.chart_action
m=sm.GLM(y,X,family=sm.families.Binomial()).fit(cov_type='cluster',cov_kwds={'groups':d.organization_id.astype('category').cat.codes})
res=pd.DataFrame({'odds_ratio':np.exp(m.params),'ci_lo':np.exp(m.conf_int()[0]),'ci_hi':np.exp(m.conf_int()[1]),'p':m.pvalues}).round(3)
print('\n## logistic: chart action on viz prompts, n=',len(d),'orgs',d.organization_id.nunique()); print(res.to_string())
out['logit']=res.reset_index().rename(columns={'index':'feature'}).to_dict('records')
# D. agent-level distribution
ag=viz.groupby('ai_agent_id').agg(n=('chart_action','size'),rate=('chart_action','mean'),metrics=('metrics_count','first'),scoped=('scoped','first'),memory=('memory','first'),org=('organization_id','first')).query('n>=50')
print('\n## agents with >=50 viz prompts:',len(ag),'| rate quantiles',(ag.rate*100).quantile([.1,.25,.5,.75,.9]).round(1).to_dict(),'| zero-acceptance agents',(ag.rate==0).sum())
print('corr(rate, log metrics)',round(np.corrcoef(ag.rate,np.log1p(ag.metrics.fillna(0)))[0,1],3),'| rate scoped vs not',ag.groupby('scoped').rate.mean().round(3).to_dict(),'| memory vs not',ag.groupby('memory').rate.mean().round(3).to_dict())
# E. adoption persistence
p['week']=p.ts.dt.to_period('W'); uw=p.groupby('user_id').week.nunique(); ow=p.groupby('organization_id').week.nunique()
print('\n## persistence: users',len(uw),'users with >=2 active weeks',round((uw>=2).mean()*100,1),'% >=4 weeks',round((uw>=4).mean()*100,1),'% | orgs',len(ow),'orgs >=4 active weeks',round((ow>=4).mean()*100,1),'%')
last=p.groupby('organization_id').ts.max(); print('orgs with no prompt in last 30d',round((last<p.ts.max()-pd.Timedelta(days=30)).mean()*100,1),'%')
# org-level: pos rate vs persistence
o=p.groupby('organization_id').agg(prompts=('pos','size'),pos=('pos','mean'),weeks=('week','nunique'),users=('user_id','nunique'),sqlshare=('sql','mean'),metrics=('metrics_count','first')).query('prompts>=30')
print('orgs>=30 prompts',len(o),'| corr(pos rate, active weeks)',round(np.corrcoef(o.pos,o.weeks)[0,1],3),'| corr(sql share, active weeks)',round(np.corrcoef(o.sqlshare,o.weeks)[0,1],3),'| corr(log metrics, weeks)',round(np.corrcoef(np.log1p(o.metrics.fillna(0)),o.weeks)[0,1],3))
print('org pos-rate quantiles',(o.pos*100).quantile([.1,.25,.5,.75,.9]).round(1).to_dict())
json.dump(out,open(SP+'/results.json','w'),default=str)
