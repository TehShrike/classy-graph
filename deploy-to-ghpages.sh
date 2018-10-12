git checkout -b gh-pages
git add public/bundle.* -f
git commit -m 'TravisCI auto-commit'
git push origin gh-pages
