FROM golang:1.27-alpine AS build

RUN adduser -D -u 1000 sunfall

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /sunfall

FROM build AS test

RUN go test -v ./...

FROM scratch AS prod

WORKDIR /app

COPY --from=build /etc/passwd /etc/passwd
COPY --from=build /etc/group /etc/group

COPY --from=build /sunfall /sunfall

USER sunfall

EXPOSE 8080

ENTRYPOINT ["/sunfall"]
