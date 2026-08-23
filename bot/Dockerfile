FROM golang:1.27-alpine AS build

RUN adduser -D -u 1000 bot

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /bot

FROM build AS test

RUN go test -v ./...

FROM scratch AS prod

WORKDIR /app

COPY --from=build /etc/passwd /etc/passwd
COPY --from=build /etc/group /etc/group

COPY --from=build /bot /bot

USER bot

EXPOSE 8080

ENTRYPOINT ["/bot"]
