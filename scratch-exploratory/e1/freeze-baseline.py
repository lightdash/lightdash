import json
import shutil
import os
from pathlib import Path

root=Path(__file__).resolve().parents[2]
work=Path(os.environ.get('EXPLORATORY_WORK_DIR',root/'scratch-exploratory/e1/.work')).resolve()
out=work/'baseline-workspaces'
old=work/'old-cli'
old.mkdir(parents=True,exist_ok=True)
shutil.copytree(root/'packages/cli/dist',old/'dist',dirs_exist_ok=True)
shutil.copy2(root/'packages/cli/package.json',old/'package.json')
names=['common','warehouses','formula']
for name in names:
    src=root/'packages'/name
    dest=out/name
    dest.mkdir(parents=True,exist_ok=True)
    shutil.copy2(src/'package.json',dest/'package.json')
    shutil.copytree(src/'dist',dest/'dist',dirs_exist_ok=True)


def link(dest,src):
    if dest.is_symlink():
        dest.unlink()
    if dest.exists():
        raise RuntimeError('Unexpected existing dependency directory')
    name=src.name
    target=out/name if src.parent.name=='@lightdash' and name in names else src.resolve()
    dest.symlink_to(target,target_is_directory=target.is_dir())


def populate(dest,sources):
    if dest.is_symlink():
        dest.unlink()
    dest.mkdir(parents=True,exist_ok=True)
    for source in sources:
        for item in source.iterdir():
            if item.name.startswith('.'):
                continue
            if item.name.startswith('@'):
                scope=dest/item.name
                scope.mkdir(exist_ok=True)
                for package in item.iterdir():
                    link(scope/package.name,package)
            else:
                link(dest/item.name,item)


for name in names:
    populate(out/name/'node_modules',[root/'node_modules',root/'packages'/name/'node_modules'])
for name in ['old-cli','cli-3.19.0']:
    if (work/name).exists():
        populate(work/name/'node_modules',[root/'node_modules',root/'packages/cli/node_modules'])
print('Baseline CLI workspace code and dependency links are frozen.')
