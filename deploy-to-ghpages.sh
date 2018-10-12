git clone -q -b gh-pages https://TehShrike:$GITHUB_API_KEY@github.com/TehShrike/classy-graph.git deploy
cp public/* deploy/
cd deploy
git add *
git commit -m 'TravisCI auto-commit'
git push origin gh-pages
