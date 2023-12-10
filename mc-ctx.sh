#!/bin/bash

p="$(which "$0")"
p="$(readlink -f "$p")"

subcmd="$1"
shift

if [ "$subcmd" == "plugins" ]; then
    subsubcmd="$1"
    shift
    if [ "$subsubcmd" == "add" ]; then
        (cd "$(dirname "$p")" && deno run --allow-read --allow-write --allow-net ./add.ts "$@")
        exit $?
    fi
    if [ "$subsubcmd" == "remove" ]; then
        (cd "$(dirname "$p")" && deno run --allow-read --allow-write --allow-net ./remove.ts "$@")
        exit $?
    fi
    if [ "$subsubcmd" == "list" ] || [ "$subsubcmd" == "ls" ]; then
        (cd "$(dirname "$p")" && deno run --allow-read --allow-net ./list.ts "$@")
        exit $?
    fi
    if [ "$subsubcmd" == "update" ]; then
        (cd "$(dirname "$p")" && deno run --allow-read --allow-write --allow-net ./update.ts "$@")
        exit $?
    fi

    function plugins_help() {
        echo "Usage: $0 plugins add <plugin-name>[@<version>] ..."
        echo "       $0 plugins remove <plugin-name> ..."
        echo "       $0 plugins list"
        echo "       $0 plugins update"
    }
    
    if [ "$subsubcmd" == "help" ] || [ "$subsubcmd" == "" ]; then
        plugins_help
        exit 0
    fi

    plugins_help >&2
    exit 1
fi

if [ "$subcmd" == "restart" ] || [ "$subcmd" == "start" ]; then
    (cd "$(dirname "$p")" && (docker-compose pull; docker-compose up -d) )
    exit $?
fi

function help() {
    echo "Usage: $0 plugins ..."
    echo "       $0 restart"
}

if [ "$subcmd" == "help" ] || [ "$subcmd" == "" ]; then
    help
    exit 0
fi

help >&2
exit 1
