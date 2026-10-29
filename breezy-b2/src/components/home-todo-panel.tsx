"use client";

import { useState, useTransition } from "react";
import { TodoToggle } from "@/components/todo-toggle";
import { addTodoAction, toggleAllTodosAction } from "@/lib/actions";

interface Todo {
  id: number;
  text: string;
  time?: string;
  done: boolean;
}

/**
 * 今日调理待办：勾选 + 全部完成 + 添加待办
 * 对齐冻结版首页 dash-todo（markAllDone / showAddTodo / confirmAddTodo）
 */
export function HomeTodoPanel({ todos }: { todos: Todo[] }) {
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3 pt-6">
      {todos.length === 0 ? (
        <p className="py-2 text-center text-sm text-muted-foreground">
          今日还没有待办，添一条 →
        </p>
      ) : (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => toggleAllTodosAction())}
              className="text-xs text-primary hover:underline disabled:opacity-60"
            >
              全部完成
            </button>
          </div>
          {todos.map((t) => (
            <TodoToggle key={t.id} id={t.id} done={t.done} label={t.text} time={t.time} />
          ))}
        </>
      )}

      {adding ? (
        <form
          action={async (fd) => {
            await addTodoAction(fd);
            setAdding(false);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            name="content"
            maxLength={50}
            required
            autoFocus
            placeholder="要做什么？如：泡脚20分钟"
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <input
            name="time"
            type="time"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
          <button
            type="submit"
            className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90"
          >
            添加
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="h-9 rounded-md border border-input px-3 text-sm hover:bg-accent"
          >
            取消
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-xs text-primary hover:underline"
        >
          + 添加待办
        </button>
      )}
    </div>
  );
}
