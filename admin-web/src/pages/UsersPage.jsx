import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Table, Input, Tag, Space, Typography, Button, Popconfirm, message } from 'antd';
import client from '../api/client';

const { Search } = Input;
const { Title } = Typography;

export default function UsersPage() {
  const navigate = useNavigate();
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/users', {
        params: { page, page_size: pageSize, search: search || undefined },
      });
      setData(res.data);
    } catch {
      // Error handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleStatus = async (record) => {
    try {
      await client.patch(`/users/${record.id}/status`, {
        is_active: !record.is_active,
      });
      message.success(record.is_active ? '已禁用' : '已启用');
      fetchUsers();
    } catch (err) {
      const code = err.response?.data?.detail?.code;
      if (code === 'cannot_disable_self') {
        message.error('不能禁用自己的账号');
      } else {
        message.error('操作失败');
      }
    }
  };

  const handleSearch = (value) => {
    setSearch(value);
    setPage(1);
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'vi_user_id',
      key: 'vi_user_id',
      render: (text, record) => (
        <Link to={`/users/${record.id}`}>{text || record.id}</Link>
      ),
    },
    {
      title: 'Firebase UID',
      dataIndex: 'firebase_uid',
      key: 'firebase_uid',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '\u663e\u793a\u540d',
      dataIndex: 'display_name',
      key: 'display_name',
    },
    {
      title: '\u89d2\u8272',
      dataIndex: 'role',
      key: 'role',
      render: (role) => (
        <Tag color={role === 'admin' ? 'red' : 'blue'}>{role}</Tag>
      ),
    },
    {
      title: '\u72b6\u6001',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active) => (
        <Tag color={active ? 'green' : 'default'}>
          {active ? '\u542f\u7528' : '\u7981\u7528'}
        </Tag>
      ),
    },
    {
      title: '\u8bbe\u5907\u6570',
      dataIndex: 'device_count',
      key: 'device_count',
      render: (count, record) =>
        count > 0 ? (
          <a onClick={() => navigate(`/devices?user_id=${record.id}`)}>
            {count}
          </a>
        ) : (
          count
        ),
    },
    {
      title: '\u9080\u8bf7\u7801\u6570',
      dataIndex: 'invite_code_count',
      key: 'invite_code_count',
      render: (count, record) =>
        count > 0 ? (
          <a onClick={() => navigate(`/invite-codes?creator_id=${record.id}`)}>
            {count}
          </a>
        ) : (
          count
        ),
    },
    {
      title: '\u6ce8\u518c\u9080\u8bf7\u7801',
      dataIndex: 'invite_code',
      key: 'invite_code',
      render: (code) =>
        code ? (
          <Link to={`/invite-codes/${code.id || code}`}>
            {code.code || code}
          </Link>
        ) : (
          '-'
        ),
    },
    {
      title: '\u6700\u540e\u767b\u5f55',
      dataIndex: 'last_login',
      key: 'last_login',
      render: (text) => (text ? new Date(text).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text) => (text ? new Date(text).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Popconfirm
          title={record.is_active ? '确认禁用该用户？' : '确认启用该用户？'}
          onConfirm={() => handleToggleStatus(record)}
        >
          <Button
            size="small"
            type={record.is_active ? 'default' : 'primary'}
            danger={record.is_active}
          >
            {record.is_active ? '禁用' : '启用'}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Title level={4}>{'\u7528\u6237\u7ba1\u7406'}</Title>
      <Search
        placeholder={'\u641c\u7d22\u90ae\u7bb1\u6216\u7528\u6237 ID'}
        allowClear
        enterButton
        onSearch={handleSearch}
        style={{ maxWidth: 400 }}
      />
      <Table
        columns={columns}
        dataSource={data.items}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total: data.total,
          showSizeChanger: true,
          showTotal: (total) => `\u5171 ${total} \u6761`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />
    </Space>
  );
}
