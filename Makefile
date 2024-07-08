ecr:
	docker build --platform=linux/amd64 -t lightdash .
	docker tag lightdash:latest 153390026119.dkr.ecr.eu-west-1.amazonaws.com/lightdash:latest
	docker push 153390026119.dkr.ecr.eu-west-1.amazonaws.com/lightdash:latest
